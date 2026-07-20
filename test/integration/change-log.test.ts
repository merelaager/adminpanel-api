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
let cookie = "";
let bossId = 0;
let childId = 0;
let recordId = 0;
let regId = 0;

before(async () => {
  await resetDb();
  await createShiftInfo(1);

  const boss = await createUser({
    username: "boss1",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  bossId = boss.id;

  const { child, registration } = await createChildWithRegistration({
    name: "Logged Camper",
    shiftNr: 1,
    overrides: { isRegistered: false },
  });
  childId = child.id;
  regId = registration.id;

  const record = await prisma.record.create({
    data: { childId, shiftNr: 1, year: YEAR, ageAtCamp: 11, isActive: true },
  });
  recordId = record.id;

  app = await build();
  cookie = await loginAs(app, "boss1");
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

const patchRecord = (payload: object) =>
  app.inject({
    method: "PATCH",
    url: `/api/records/${recordId}`,
    headers: { cookie },
    payload,
  });

const patchRegistration = (payload: object) =>
  app.inject({
    method: "PATCH",
    url: `/api/registrations/${regId}`,
    headers: { cookie },
    payload,
  });

void test("assigning a tent logs the change", async () => {
  const res = await patchRecord({ tentNr: 4 });
  assert.equal(res.statusCode, 204);

  const logs = await prisma.changeLog.findMany({ where: { field: "tentNr" } });
  assert.equal(logs.length, 1);
  assert.deepEqual(
    {
      userId: logs[0].userId,
      entity: logs[0].entity,
      entityId: logs[0].entityId,
      childId: logs[0].childId,
      shiftNr: logs[0].shiftNr,
      oldValue: logs[0].oldValue,
      newValue: logs[0].newValue,
    },
    {
      userId: bossId,
      entity: "record",
      entityId: recordId,
      childId,
      shiftNr: 1,
      oldValue: null,
      newValue: "4",
    },
  );
});

void test("removing from a tent logs the change", async () => {
  const res = await patchRecord({ tentNr: null });
  assert.equal(res.statusCode, 204);

  const logs = await prisma.changeLog.findMany({
    where: { field: "tentNr" },
    orderBy: { id: "asc" },
  });
  assert.equal(logs.length, 2);
  assert.equal(logs[1].oldValue, "4");
  assert.equal(logs[1].newValue, null);
});

void test("a no-op tent patch is not logged", async () => {
  const res = await patchRecord({ tentNr: null, isPresent: true });
  assert.equal(res.statusCode, 204);

  const count = await prisma.changeLog.count({ where: { field: "tentNr" } });
  assert.equal(count, 2);
});

void test("toggling isRegistered logs the change", async () => {
  assert.equal(
    (await patchRegistration({ isRegistered: true })).statusCode,
    204,
  );
  assert.equal(
    (await patchRegistration({ isRegistered: false })).statusCode,
    204,
  );
  // Repeating the same value changes nothing, so nothing is logged.
  assert.equal(
    (await patchRegistration({ isRegistered: false })).statusCode,
    204,
  );

  const logs = await prisma.changeLog.findMany({
    where: { field: "isRegistered" },
    orderBy: { id: "asc" },
  });
  assert.equal(logs.length, 2);
  assert.deepEqual(
    logs.map((log) => [log.oldValue, log.newValue]),
    [
      ["false", "true"],
      ["true", "false"],
    ],
  );
  assert.equal(logs[0].entity, "registration");
  assert.equal(logs[0].entityId, regId);
  assert.equal(logs[0].userId, bossId);
  assert.equal(logs[0].childId, childId);
});
