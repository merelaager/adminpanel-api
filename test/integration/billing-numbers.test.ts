import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";

import "../helpers/test-env";

import {
  allocateAccountReference,
  allocateBillNumber,
} from "#app/services/billing-numbers.service";

import { resetDb, prisma } from "../helpers/db";

before(async () => {
  await resetDb();
});

beforeEach(async () => {
  await prisma.billingCounter.deleteMany();
});

after(async () => {
  await prisma.$disconnect();
});

const billNumber = (season: number) =>
  prisma.$transaction((tx) => allocateBillNumber(tx, season));

const accountReference = (season: number) =>
  prisma.$transaction((tx) => allocateAccountReference(tx, season));

void test("bill numbers count up within a season", async () => {
  assert.equal(await billNumber(2027), 2027001);
  assert.equal(await billNumber(2027), 2027002);
  assert.equal(await billNumber(2027), 2027003);
});

void test("each season has its own bill counter", async () => {
  assert.equal(await billNumber(2027), 2027001);
  assert.equal(await billNumber(2028), 2028001);
  assert.equal(await billNumber(2027), 2027002);
});

void test("account references are 2-digit year + 3 digits + check digit", async () => {
  assert.equal(await accountReference(2027), "270018");
  assert.equal(await accountReference(2027), "270021");
  assert.equal(await accountReference(2028), "280011");
});

void test("bill numbers and account references use separate counters", async () => {
  assert.equal(await billNumber(2027), 2027001);
  assert.equal(await accountReference(2027), "270018");
  assert.equal(await billNumber(2027), 2027002);
});

void test("concurrent allocations get distinct bill numbers", async () => {
  const numbers = await Promise.all(
    Array.from({ length: 10 }, () => billNumber(2027)),
  );
  assert.deepEqual(
    [...numbers].sort((a, b) => a - b),
    Array.from({ length: 10 }, (_, i) => 2027001 + i),
  );
});

void test("a rolled-back transaction gives its number back", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await allocateBillNumber(tx, 2027);
      throw new Error("issuing failed");
    }),
  );
  assert.equal(await billNumber(2027), 2027001);
});

void test("running out of bill numbers is an error", async () => {
  await prisma.billingCounter.create({
    data: { season: 2027, kind: "bill", lastValue: 999 },
  });
  await assert.rejects(billNumber(2027), /run out of bill numbers/);
});
