import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

interface RecordsResponse {
  status: string;
  data: { records: { shiftNr: number; year: number }[] };
}

let app: FastifyInstance;
let childId = 0;

const cookies: Record<string, string> = {};

const fetchRecords = (qs: string, as: string) =>
  app.inject({
    method: "GET",
    url: `/api/records${qs}`,
    headers: { cookie: cookies[as] },
  });

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createShiftInfo(2);

  await createUser({
    username: "boss1",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  await createUser({
    username: "boss2",
    roles: [{ shiftNr: 2, roleName: "boss" }],
  });
  await createUser({ username: "norole" });

  // One child registered in both shifts, with a current-year record in shift 1
  // and a previous-year record in shift 2.
  const { child, registration } = await createChildWithRegistration({
    name: "Cross Shift Camper",
    shiftNr: 1,
    overrides: { isRegistered: true },
  });
  childId = child.id;

  await prisma.registration.create({
    data: {
      childId,
      shiftNr: 2,
      regId: randomUUID(),
      regOrder: registration.regOrder + 1000,
      birthday: registration.birthday,
      tsSize: "M",
      road: "x",
      city: "x",
      county: "x",
      contactName: "Parent",
      contactNumber: "5551234",
      contactEmail: registration.contactEmail,
    },
  });

  await prisma.record.create({
    data: { childId, shiftNr: 1, year: YEAR, ageAtCamp: 11, isActive: true },
  });
  await prisma.record.create({
    data: {
      childId,
      shiftNr: 2,
      year: YEAR - 1,
      ageAtCamp: 10,
      isActive: true,
    },
  });

  app = await build();
  for (const username of ["boss1", "boss2", "norole"]) {
    cookies[username] = await loginAs(app, username);
  }
});

after(async () => {
  await app.close();
});

void test("childId alone returns the child's records across shifts and years", async () => {
  const res = await fetchRecords(`?childId=${childId}`, "boss1");
  assert.equal(res.statusCode, 200);
  const { records } = res.json<RecordsResponse>().data;
  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((r) => r.shiftNr).sort(),
    [1, 2],
  );
});

void test("childId + shiftNr narrows the records to that shift", async () => {
  const res = await fetchRecords(`?childId=${childId}&shiftNr=1`, "boss1");
  assert.equal(res.statusCode, 200);
  const { records } = res.json<RecordsResponse>().data;
  assert.equal(records.length, 1);
  assert.equal(records[0].shiftNr, 1);
});

void test("childId + shiftNr authorises against that shift alone", async () => {
  // boss2 may not view shift 1, even though the child is also in shift 2.
  const denied = await fetchRecords(`?childId=${childId}&shiftNr=1`, "boss2");
  assert.equal(denied.statusCode, 403);

  const allowed = await fetchRecords(`?childId=${childId}&shiftNr=2`, "boss2");
  assert.equal(allowed.statusCode, 200);
  const { records } = allowed.json<RecordsResponse>().data;
  assert.equal(records.length, 1);
  assert.equal(records[0].shiftNr, 2);
});

void test("shiftNr alone still returns the current-year shift records", async () => {
  const res = await fetchRecords("?shiftNr=1", "boss1");
  assert.equal(res.statusCode, 200);
  const { records } = res.json<RecordsResponse>().data;
  assert.equal(records.length, 1);
  assert.equal(records[0].year, YEAR);
});

void test("no filter at all is a 400", async () => {
  const res = await fetchRecords("", "boss1");
  assert.equal(res.statusCode, 400);
  assert.equal(res.json<{ status: string }>().status, "fail");
});

void test("a user with no roles is denied the combined query", async () => {
  const res = await fetchRecords(`?childId=${childId}&shiftNr=1`, "norole");
  assert.equal(res.statusCode, 403);
});
