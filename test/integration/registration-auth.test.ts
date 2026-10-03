import { TEST_REGISTRATION_API_KEY } from "../helpers/test-env";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import { createShiftInfo, createUser, loginAs } from "../helpers/fixtures";

let app: FastifyInstance;
let superrootCookie = "";
let bossCookie = "";

const payload = [
  {
    name: "Auth Kid",
    shiftNr: 1,
    isNew: true,
    shirtSize: "M",
    road: "Road 1",
    city: "City",
    county: "County",
    country: "Eesti",
    contactName: "Parent",
    contactEmail: "auth@test.invalid",
    contactNumber: "5551111",
    sex: "F",
    dob: new Date(Date.UTC(2015, 0, 2)).toISOString(),
    sendEmail: false,
  },
];

const post = (headers: Record<string, string>, body: unknown = payload) =>
  app.inject({
    method: "POST",
    url: "/api/registrations",
    headers,
    payload: body as object,
  });

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createUser({ username: "superroot", superRoot: true });
  await createUser({
    username: "boss",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  app = await build();
  superrootCookie = await loginAs(app, "superroot");
  bossCookie = await loginAs(app, "boss");
});

after(async () => {
  await app.close();
});

void test("the service key may create registrations", async () => {
  const res = await post({
    authorization: `Bearer ${TEST_REGISTRATION_API_KEY}`,
  });
  assert.equal(res.statusCode, 201);
});

void test("a superroot session may create registrations", async () => {
  const res = await post({ cookie: superrootCookie });
  assert.equal(res.statusCode, 201);
});

void test("anonymous callers are 401 and nothing is created", async () => {
  const before = await prisma.registration.count();
  const res = await post({});
  assert.equal(res.statusCode, 401);
  assert.equal(res.json<{ status: string }>().status, "fail");
  assert.equal(await prisma.registration.count(), before);
});

void test("anonymous callers are 401 even with an invalid body", async () => {
  const res = await post({}, {});
  assert.equal(res.statusCode, 401);
});

void test("a wrong service key is 401", async () => {
  for (const authorization of [
    "Bearer wrong",
    `Bearer ${TEST_REGISTRATION_API_KEY}x`,
    TEST_REGISTRATION_API_KEY,
  ]) {
    const res = await post({ authorization });
    assert.equal(res.statusCode, 401, authorization);
  }
});

void test("a non-superroot session is 403", async () => {
  const res = await post({ cookie: bossCookie });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json<{ status: string }>().status, "fail");
});
