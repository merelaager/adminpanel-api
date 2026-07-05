import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import {
  createShiftInfo,
  createUser,
  createChildWithRegistration,
  loginAs,
} from "../helpers/fixtures";

const YEAR = new Date().getUTCFullYear();

let app: FastifyInstance;

const cookies: Record<string, string> = {};

// Fixture ids captured for dynamic URLs.
let bossId = 0;
let reserveRegId = 0;
let recordId = 0;
let tentScoreId = 0;
let billChildId = 0;
let billRegId = 0;

// Captured while the matrix runs (the bill POST assigns an autoincrement id).
let capturedBillNr = 999999;

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createShiftInfo(2);

  const superroot = await createUser({
    username: "superroot",
    superRoot: true,
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  const boss = await createUser({
    username: "boss",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  await createUser({
    username: "instructor",
    roles: [{ shiftNr: 1, roleName: "instructor" }],
  });
  await createUser({
    username: "helper",
    roles: [
      { shiftNr: 1, roleName: "helper" },
      { shiftNr: 99, roleName: "helper" },
    ],
  });
  await createUser({
    username: "viewer",
    roles: [{ shiftNr: 1, roleName: "reg-viewer-basic" }],
  });
  await createUser({
    username: "outsider",
    roles: [{ shiftNr: 2, roleName: "boss" }],
  });
  await createUser({ username: "norole" });

  bossId = boss.id;
  void superroot;

  // The billable, registered camper.
  const bill = await createChildWithRegistration({
    name: "Bill Camper",
    shiftNr: 1,
    overrides: {
      contactEmail: "bill-parent@test.invalid",
      isRegistered: true,
      priceToPay: 340,
    },
  });
  billChildId = bill.child.id;
  billRegId = bill.registration.id;

  // A reserve (unregistered) camper; the mutating registration PATCH rows
  // target this one so the billable camper stays stable.
  const reserve = await createChildWithRegistration({
    name: "Reserve Camper",
    shiftNr: 1,
  });
  reserveRegId = reserve.registration.id;

  const record = await prisma.record.create({
    data: {
      childId: bill.child.id,
      shiftNr: 1,
      year: YEAR,
      ageAtCamp: 12,
      isActive: true,
    },
  });
  recordId = record.id;

  await prisma.team.create({
    data: { shiftNr: 1, name: "Alpha", year: YEAR },
  });

  const tentScore = await prisma.tentScore.create({
    data: { shiftNr: 1, tentNr: 1, score: 5, year: YEAR },
  });
  tentScoreId = tentScore.id;

  app = await build();

  for (const username of [
    "superroot",
    "boss",
    "instructor",
    "helper",
    "viewer",
    "outsider",
    "norole",
  ]) {
    cookies[username] = await loginAs(app, username);
  }
});

after(async () => {
  await app.close();
});

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type Expectation = [as: string, status: number];

interface MatrixCase {
  method: Method;
  url: string | (() => string);
  body?: object;
  as: string;
  expect: number;
  capture?: (res: InjectResponse) => void;
  assertEmptyBody?: boolean;
}

const cases: MatrixCase[] = [];

const add = (
  method: Method,
  url: string | (() => string),
  body: object | undefined,
  expectations: Expectation[],
  opts: Pick<MatrixCase, "capture" | "assertEmptyBody"> = {},
): void => {
  for (const [as, expect] of expectations) {
    cases.push({ method, url, body, as, expect, ...opts });
  }
};

const captureBillNr = (res: InjectResponse): void => {
  if (res.statusCode === 201) {
    capturedBillNr = res.json<{ data: { billNr: number } }>().data.billNr;
  }
};

// GET /api/shifts — no guard, everyone authenticated gets 200.
add("GET", "/api/shifts", undefined, [
  ["superroot", 200],
  ["boss", 200],
  ["instructor", 200],
  ["helper", 200],
  ["viewer", 200],
  ["outsider", 200],
  ["norole", 200],
]);

add("GET", "/api/shifts/1/users", undefined, [
  ["boss", 200],
  ["instructor", 403],
  ["helper", 403],
  ["viewer", 403],
  ["outsider", 403],
  ["norole", 403],
]);

add("GET", "/api/shifts/1/billing", undefined, [
  ["boss", 200],
  ["instructor", 403],
  ["helper", 403],
  ["viewer", 403],
  ["outsider", 403],
]);

add("GET", "/api/shifts/1/records", undefined, [
  ["boss", 200],
  ["instructor", 200],
  ["helper", 200],
  ["viewer", 403],
  ["outsider", 403],
  ["norole", 403],
]);

add("GET", "/api/shifts/1/emails", undefined, [
  ["boss", 200],
  ["instructor", 200],
  ["helper", 403],
  ["viewer", 403],
  ["outsider", 403],
]);

add("GET", "/api/shifts/1/staff", undefined, [
  ["boss", 200],
  ["instructor", 200],
  ["helper", 200],
  ["viewer", 403],
  ["outsider", 403],
]);

add("GET", "/api/shifts/1/pdf", undefined, [
  ["boss", 200],
  ["instructor", 403],
  ["helper", 403],
  ["viewer", 403],
  ["outsider", 403],
]);

add("GET", "/api/shifts/1/tents", undefined, [
  ["boss", 200],
  ["instructor", 200],
  ["helper", 200],
  ["viewer", 403],
  ["outsider", 403],
]);

add("GET", "/api/shifts/1/tents/1", undefined, [
  ["boss", 200],
  ["helper", 200],
  ["viewer", 403],
  ["outsider", 403],
]);

add("POST", "/api/shifts/1/tents/2", { score: 5 }, [
  ["boss", 201],
  ["instructor", 201],
  ["helper", 201],
  ["viewer", 403],
  ["outsider", 403],
  ["norole", 403],
]);

add("GET", "/api/teams?shiftNr=1", undefined, [
  ["boss", 200],
  ["helper", 200],
  ["viewer", 403],
  ["outsider", 403],
]);

add("POST", "/api/teams", { shiftNr: 1, name: "Uus" }, [
  ["helper", 201],
  ["viewer", 403],
  ["outsider", 403],
]);

add("GET", "/api/registrations?shiftNr=1", undefined, [
  ["superroot", 200],
  ["boss", 200],
  ["instructor", 200],
  ["helper", 200],
  ["viewer", 200],
  ["outsider", 200],
  ["norole", 200],
]);

// Mutating registration rows: target the reserve registration.
add("PATCH", () => `/api/registrations/${reserveRegId}`, { isRegistered: true }, [
  ["boss", 204],
  ["instructor", 404],
  ["helper", 404],
  ["viewer", 404],
  ["outsider", 404],
  ["norole", 404],
]);

add("PATCH", () => `/api/registrations/${reserveRegId}`, { pricePaid: 10 }, [
  ["boss", 204],
]);

add(
  "POST",
  "/api/registrations/sync",
  undefined,
  [
    ["superroot", 204],
    ["boss", 403],
    ["helper", 403],
    ["norole", 403],
  ],
  { assertEmptyBody: true },
);

add(
  "POST",
  "/api/bills",
  { email: "bill-parent@test.invalid" },
  [
    ["boss", 201],
    ["instructor", 403],
    ["helper", 403],
    ["viewer", 403],
    ["norole", 403],
  ],
  { capture: captureBillNr },
);

add("GET", () => `/api/bills/${capturedBillNr}`, undefined, [
  ["boss", 200],
  ["helper", 403],
]);

add("GET", "/api/bills/999999", undefined, [["boss", 404]]);

add("POST", "/api/notifications/bills", { email: "bill-parent@test.invalid" }, [
  ["boss", 204],
  ["instructor", 403],
  ["helper", 403],
]);

add("POST", "/api/notifications/bills", { email: "nobody@test.invalid" }, [
  ["boss", 404],
]);

add("POST", "/api/records", { shiftNr: 1, forceSync: true }, [
  ["boss", 204],
  ["instructor", 204],
  ["helper", 204],
  ["viewer", 403],
  ["outsider", 403],
  ["norole", 403],
]);

add("POST", "/api/records", { shiftNr: 1, forceSync: false }, [["boss", 304]]);

add("POST", "/api/records", { shiftNr: 99, forceSync: true }, [
  ["boss", 403],
  ["helper", 404],
]);

add("PATCH", () => `/api/records/${recordId}`, { tentNr: 3 }, [
  ["boss", 204],
  ["instructor", 204],
  ["helper", 204],
  ["viewer", 403],
  ["outsider", 403],
  ["norole", 403],
]);

add("PATCH", "/api/records/999999", { tentNr: 3 }, [["boss", 404]]);

// Denials must run before the successful delete removes the grade.
add("DELETE", () => `/api/grades/${tentScoreId}`, undefined, [
  ["viewer", 403],
  ["outsider", 403],
  ["helper", 204],
]);

add("DELETE", "/api/grades/999999", undefined, [["boss", 204]]);

add("PATCH", () => `/api/users/${bossId}`, { currentShift: 1 }, [["boss", 204]]);

add("PATCH", () => `/api/users/${bossId}`, { currentShift: 1 }, [
  ["instructor", 403],
]);

add("PATCH", () => `/api/users/${bossId}`, { currentShift: 2 }, [["boss", 403]]);

add("GET", () => `/api/records?childId=${billChildId}`, undefined, [
  ["boss", 200],
  ["instructor", 200],
  ["helper", 200],
  ["outsider", 403],
  ["norole", 403],
]);

add(
  "POST",
  "/api/users/invites",
  { email: "x@test.invalid", name: "X", shiftNr: 1, role: "helper" },
  [
    ["boss", 204],
    ["instructor", 403],
    ["helper", 403],
    ["outsider", 403],
  ],
);

void test("permission matrix", async (t) => {
  for (const c of cases) {
    const url = typeof c.url === "function" ? c.url() : c.url;
    await t.test(`${c.method} ${url} as ${c.as} -> ${c.expect}`, async () => {
      const res = await app.inject({
        method: c.method,
        url,
        payload: c.body,
        headers: { cookie: cookies[c.as] },
      });
      assert.equal(res.statusCode, c.expect);
      if (c.assertEmptyBody && res.statusCode === 403) {
        assert.equal(res.body, "");
      }
      c.capture?.(res);
    });
  }
});

void test("a protected route without a cookie is 401 with a message", async () => {
  const res = await app.inject({ method: "GET", url: "/api/shifts/1/users" });
  assert.equal(res.statusCode, 401);
  const body = res.json<{ status: string; data: { message: string } }>();
  assert.equal(body.status, "fail");
  assert.ok(body.data.message);
});

void test("an unknown path is 404 with data.path", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/nonsense",
    headers: { cookie: cookies.boss },
  });
  assert.equal(res.statusCode, 404);
  const body = res.json<{ status: string; data: { path: string } }>();
  assert.equal(body.status, "fail");
  assert.ok(body.data.path);
});

void test("norole gets an empty registration array (frozen quirk)", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/registrations?shiftNr=1",
    headers: { cookie: cookies.norole },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json<{ data: { registrations: unknown[] } }>();
  assert.deepEqual(body.data.registrations, []);
});

void test("boss can download the shift PDF as a non-empty application/pdf", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/shifts/1/pdf",
    headers: { cookie: cookies.boss },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers["content-type"]?.toString().startsWith("application/pdf"));
  assert.ok(res.rawPayload.length > 0);
});

void test("the bill notification marked the registration as notified", async () => {
  const reg = await prisma.registration.findUniqueOrThrow({
    where: { id: billRegId },
  });
  assert.equal(reg.notifSent, true);
});
