import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resetDb, prisma } from "../helpers/db";
import {
  createChildWithRegistration,
  createShiftInfo,
  createUser,
} from "../helpers/fixtures";
import { runRollover, type RolloverResult } from "../../prisma/rollover-core";

const YEAR = new Date().getUTCFullYear();
const DAY_MS = 24 * 60 * 60 * 1000;

let dataDir = "";
let adultChildId = 0;
let minorChildId = 0;
let rootId = 0;

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createShiftInfo(2);

  const root = await createUser({
    username: "root",
    superRoot: true,
    roles: [{ shiftNr: 1, roleName: "root" }],
  });
  rootId = root.id;
  const boss = await createUser({
    username: "boss1",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });

  const adult = await prisma.child.create({
    data: { name: "Adult", sex: "F", birthYear: YEAR - 18, idCode: "1" },
  });
  adultChildId = adult.id;
  const minor = await prisma.child.create({
    data: { name: "Minor", sex: "M", birthYear: YEAR - 17, idCode: "2" },
  });
  minorChildId = minor.id;
  await prisma.child.create({
    data: { name: "Unknown age", sex: "M", birthYear: null, idCode: "3" },
  });

  for (const [name, shiftNr, contactEmail, isRegistered] of [
    ["A", 1, "parent-a@test.invalid", true],
    ["B", 1, "parent-a@test.invalid", true],
    ["C", 1, "parent-c@test.invalid", true],
    ["D", 2, "parent-d@test.invalid", true],
    ["E", 2, "reserve@test.invalid", false],
  ] as const) {
    await createChildWithRegistration({
      name,
      shiftNr,
      overrides: { contactEmail, isRegistered },
    });
  }

  const longAgo = new Date(Date.now() - 2 * DAY_MS);
  await prisma.signupToken.createMany({
    data: [
      {
        token: "00000000-0000-0000-0000-000000000001",
        email: "old@x.invalid",
        shiftNr: 1,
        createdAt: longAgo,
      },
      {
        token: "00000000-0000-0000-0000-000000000002",
        email: "used@x.invalid",
        shiftNr: 1,
        usedDate: new Date(),
      },
      {
        token: "00000000-0000-0000-0000-000000000003",
        email: "fresh@x.invalid",
        shiftNr: 1,
      },
    ],
  });
  await prisma.resetToken.createMany({
    data: [
      { token: "old", userId: boss.id, createdAt: longAgo },
      { token: "fresh", userId: boss.id },
    ],
  });

  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "rollover-"));
  await fs.mkdir(path.join(dataDir, "files"));
  await fs.mkdir(path.join(dataDir, "arved"));
  await fs.writeFile(path.join(dataDir, "files", "1v_nimekiri.pdf"), "pdf");
  await fs.writeFile(path.join(dataDir, "arved", "7.pdf"), "pdf");
  await fs.writeFile(path.join(dataDir, "arved", ".gitkeep"), "");
});

let applied: Promise<RolloverResult> | undefined;
const applyRollover = () =>
  (applied ??= runRollover(prisma, { year: YEAR, apply: true, dataDir }));

after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

void test("dry run reports what would change and changes nothing", async () => {
  const result = await runRollover(prisma, {
    year: YEAR,
    apply: false,
    dataDir,
  });

  assert.equal(result.idCodesCleared, 1);
  assert.equal(result.idCodesWithoutBirthYear, 1);
  assert.equal(result.registrationsDeleted, 5);
  assert.deepEqual(
    result.emailFiles.map(({ shiftNr, count }) => ({ shiftNr, count })),
    [
      { shiftNr: 1, count: 2 },
      { shiftNr: 2, count: 1 },
    ],
  );
  assert.equal(result.userRolesDeleted, 1);
  assert.equal(result.signupTokensDeleted, 2);
  assert.equal(result.resetTokensDeleted, 1);
  assert.equal(result.camperListsDeleted, 1);
  assert.equal(result.billsArchived, 1);

  assert.equal(await prisma.registration.count(), 5);
  assert.equal(await prisma.userRoles.count(), 2);
  assert.equal(
    (await prisma.child.findUniqueOrThrow({ where: { id: adultChildId } }))
      .idCode,
    "1",
  );
  assert.deepEqual((await fs.readdir(dataDir)).sort(), ["arved", "files"]);
});

void test("--apply writes one email file per shift, with registered campers' parents only", async () => {
  await applyRollover();

  const shift1 = await fs.readFile(
    path.join(dataDir, `parent-emails-${YEAR}-1v.txt`),
    "utf8",
  );
  assert.deepEqual(shift1.trim().split("\n").sort(), [
    "parent-a@test.invalid",
    "parent-c@test.invalid",
  ]);
  const shift2 = await fs.readFile(
    path.join(dataDir, `parent-emails-${YEAR}-2v.txt`),
    "utf8",
  );
  assert.equal(shift2, "parent-d@test.invalid\n");
});

void test("--apply clears the ID code of children who turned 18 and keeps their birth year", async () => {
  await applyRollover();

  const adult = await prisma.child.findUniqueOrThrow({
    where: { id: adultChildId },
  });
  assert.equal(adult.idCode, null);
  assert.equal(adult.birthYear, YEAR - 18);

  const minor = await prisma.child.findUniqueOrThrow({
    where: { id: minorChildId },
  });
  assert.equal(minor.idCode, "2");
});

void test("--apply deletes all registrations", async () => {
  const result = await applyRollover();

  assert.equal(result.registrationsDeleted, 5);
  assert.equal(await prisma.registration.count(), 0);
});

void test("--apply keeps only root users' shift roles", async () => {
  await applyRollover();

  const roles = await prisma.userRoles.findMany();
  assert.deepEqual(
    roles.map((role) => role.userId),
    [rootId],
  );
});

void test("--apply deletes used and expired tokens and keeps fresh ones", async () => {
  await applyRollover();

  const signupTokens = await prisma.signupToken.findMany();
  assert.deepEqual(
    signupTokens.map((token) => token.email),
    ["fresh@x.invalid"],
  );
  const resetTokens = await prisma.resetToken.findMany();
  assert.deepEqual(
    resetTokens.map((token) => token.token),
    ["fresh"],
  );
});

void test("--apply deletes camper lists and moves bill PDFs to the archive", async () => {
  await applyRollover();

  assert.deepEqual(await fs.readdir(path.join(dataDir, "files")), []);
  assert.deepEqual(await fs.readdir(path.join(dataDir, "arved")), [".gitkeep"]);
  assert.deepEqual(
    await fs.readdir(path.join(dataDir, "arved-archive", String(YEAR))),
    ["7.pdf"],
  );
});
