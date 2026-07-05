import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb } from "../helpers/db";
import {
  createShiftInfo,
  createUser,
  createChildWithRegistration,
  loginAs,
} from "../helpers/fixtures";

interface Registration {
  id: number;
  childId: number;
  child: { name: string; sex: string; currentAge: number };
  shiftNr: number;
  isRegistered: boolean;
  regOrder: number;
  isOld: boolean;
  tsSize: string;
  [key: string]: unknown;
}

let app: FastifyInstance;

const fetchFirst = async (username: string): Promise<Registration> => {
  const cookie = await loginAs(app, username);
  const res = await app.inject({
    method: "GET",
    url: "/api/registrations?shiftNr=1",
    headers: { cookie },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json<{ data: { registrations: Registration[] } }>();
  assert.ok(body.data.registrations.length > 0);
  return body.data.registrations[0];
};

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createUser({
    username: "boss",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  await createUser({
    username: "instructor",
    roles: [{ shiftNr: 1, roleName: "instructor" }],
  });
  await createUser({
    username: "helper",
    roles: [{ shiftNr: 1, roleName: "helper" }],
  });
  await createUser({
    username: "viewer",
    roles: [{ shiftNr: 1, roleName: "reg-viewer-basic" }],
  });

  await createChildWithRegistration({
    name: "Visible Camper",
    shiftNr: 1,
    overrides: {
      isRegistered: true,
      addendum: "A note",
      backupTel: "5559999",
    },
  });

  app = await build();
});

after(async () => {
  await app.close();
});

const BASIC_FIELDS = [
  "id",
  "childId",
  "shiftNr",
  "isRegistered",
  "regOrder",
  "isOld",
  "tsSize",
] as const;

const assertBasics = (reg: Registration): void => {
  for (const field of BASIC_FIELDS) {
    assert.ok(field in reg, `${field} present`);
  }
  assert.equal(typeof reg.child.name, "string");
  assert.ok(reg.child.sex === "M" || reg.child.sex === "F");
  assert.ok(Number.isInteger(reg.child.currentAge));
};

void test("boss sees every permission-gated field", async () => {
  const reg = await fetchFirst("boss");
  assertBasics(reg);
  for (const field of [
    "birthday",
    "road",
    "county",
    "country",
    "addendum",
    "pricePaid",
    "priceToPay",
    "notifSent",
    "billId",
    "contactName",
    "contactNumber",
    "contactEmail",
    "backupTel",
  ]) {
    assert.ok(field in reg, `boss should see ${field}`);
  }
});

void test("instructor sees contact fields only", async () => {
  const reg = await fetchFirst("instructor");
  assertBasics(reg);
  assert.ok("contactName" in reg);
  assert.ok("contactEmail" in reg);
  assert.ok("contactNumber" in reg);
  for (const field of ["birthday", "road", "pricePaid", "priceToPay", "billId"]) {
    assert.ok(!(field in reg), `instructor should not see ${field}`);
  }
});

void test("helper sees basic fields only", async () => {
  const reg = await fetchFirst("helper");
  assertBasics(reg);
  for (const field of [
    "birthday",
    "road",
    "county",
    "country",
    "addendum",
    "pricePaid",
    "priceToPay",
    "notifSent",
    "billId",
    "contactName",
    "contactNumber",
    "contactEmail",
    "backupTel",
  ]) {
    assert.ok(!(field in reg), `helper should not see ${field}`);
  }
});

void test("viewer sees basic fields only", async () => {
  const reg = await fetchFirst("viewer");
  assertBasics(reg);
  for (const field of ["birthday", "road", "pricePaid", "contactEmail"]) {
    assert.ok(!(field in reg), `viewer should not see ${field}`);
  }
});
