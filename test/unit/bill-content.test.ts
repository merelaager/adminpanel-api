import { test } from "node:test";
import assert from "node:assert/strict";

import "../helpers/test-env";

import {
  REGISTRATION_FEE,
  SENIORITY_DISCOUNTS,
  SHIFT_PRICES,
} from "#app/constants/pricing";
import {
  buildBillContent,
  type BillableRegistration,
  type BillShift,
} from "#app/services/bill-content.service";

const cents = (euros: number) => euros * 100;
const NEW_12 = cents(SHIFT_PRICES[1]);
const OLD_12 = cents(SHIFT_PRICES[1] - SENIORITY_DISCOUNTS[1]);
const OLD_7 = cents(SHIFT_PRICES[0] - SENIORITY_DISCOUNTS[0]);
const FEE = cents(REGISTRATION_FEE);

const SHIFTS = new Map<number, BillShift>([
  [1, { startDate: new Date("2027-06-14T00:00:00.000Z"), length: 7 }],
  [2, { startDate: new Date("2027-06-23T00:00:00.000Z"), length: 12 }],
  [3, { startDate: new Date("2027-07-07T00:00:00.000Z"), length: 12 }],
]);

const ISSUED_AT = new Date("2027-01-01T12:00:00.000Z");

let nextId = 1;
const registration = (
  overrides: Partial<BillableRegistration> & { shiftNr: number },
): BillableRegistration => {
  const isOld = overrides.isOld ?? false;
  const prices = SHIFT_PRICES[overrides.shiftNr - 1];
  const discount = isOld ? SENIORITY_DISCOUNTS[overrides.shiftNr - 1] : 0;
  return {
    id: nextId++,
    childName: "Mari",
    isOld,
    priceToPay: prices - discount,
    ...overrides,
  };
};

void test("a child at the list price gets one line", () => {
  const reg = registration({ shiftNr: 2, isOld: true });
  const { items } = buildBillContent([reg], SHIFTS, ISSUED_AT);
  assert.deepEqual(items, [
    {
      position: 1,
      registrationId: reg.id,
      childName: "Mari",
      shiftNr: 2,
      description: "12päevane vahetus vanale olijale",
      amount: OLD_12,
      bookingFee: FEE,
    },
  ]);
});

void test("the description comes from the shift's length", () => {
  const { items } = buildBillContent(
    [registration({ shiftNr: 1, isOld: true })],
    SHIFTS,
    ISSUED_AT,
  );
  assert.equal(items[0].description, "7päevane vahetus vanale olijale");
  assert.equal(items[0].amount, OLD_7);
});

void test("a lower hand-set price adds a discount line after the child", () => {
  const reg = registration({ shiftNr: 2, priceToPay: SHIFT_PRICES[1] - 50 });
  const { items } = buildBillContent([reg], SHIFTS, ISSUED_AT);
  assert.equal(items.length, 2);
  assert.equal(items[0].amount, NEW_12);
  assert.deepEqual(items[1], {
    position: 2,
    registrationId: null,
    childName: "Mari",
    shiftNr: 2,
    description: "Soodustus",
    amount: cents(-50),
    bookingFee: 0,
  });
});

void test("a higher hand-set price adds a positive adjustment line", () => {
  const reg = registration({ shiftNr: 2, priceToPay: SHIFT_PRICES[1] + 20 });
  const { items } = buildBillContent([reg], SHIFTS, ISSUED_AT);
  assert.equal(items[1].description, "Juurdehindlus");
  assert.equal(items[1].amount, cents(20));
});

void test("the booking fee is capped at the child's price", () => {
  const cheap = registration({ shiftNr: 2, priceToPay: 40 });
  const free = registration({ shiftNr: 3, priceToPay: 0 });
  const { items } = buildBillContent([cheap, free], SHIFTS, ISSUED_AT);
  const mainLines = items.filter((item) => item.registrationId !== null);
  assert.deepEqual(
    mainLines.map((item) => item.bookingFee),
    [cents(40), 0],
  );
});

void test("lines are ordered by shift, then name, with consecutive positions", () => {
  const { items } = buildBillContent(
    [
      registration({ shiftNr: 3, childName: "Aino" }),
      registration({ shiftNr: 2, childName: "Peeter", priceToPay: 300 }),
      registration({ shiftNr: 2, childName: "Liis" }),
    ],
    SHIFTS,
    ISSUED_AT,
  );
  assert.deepEqual(
    items.map((item) => [item.position, item.childName, item.description]),
    [
      [1, "Liis", "12päevane vahetus uuele tulijale"],
      [2, "Peeter", "12päevane vahetus uuele tulijale"],
      [3, "Peeter", "Soodustus"],
      [4, "Aino", "12päevane vahetus uuele tulijale"],
    ],
  );
});

void test("the booking fee is due 3 days after the issue date", () => {
  const { bookingFeeDue } = buildBillContent(
    [registration({ shiftNr: 2 })],
    SHIFTS,
    ISSUED_AT,
  );
  assert.equal(bookingFeeDue.toISOString(), "2027-01-04T00:00:00.000Z");
});

void test("the camp fee is due a month before the first shift on the bill", () => {
  const { campFeeDue } = buildBillContent(
    [registration({ shiftNr: 3 }), registration({ shiftNr: 2 })],
    SHIFTS,
    ISSUED_AT,
  );
  assert.equal(campFeeDue.toISOString(), "2027-05-23T00:00:00.000Z");
});

void test("the camp fee ignores shifts that aren't on the bill", () => {
  const { campFeeDue } = buildBillContent(
    [registration({ shiftNr: 3 })],
    SHIFTS,
    ISSUED_AT,
  );
  assert.equal(campFeeDue.toISOString(), "2027-06-07T00:00:00.000Z");
});

void test("a late bill has a single deadline 3 days after issue", () => {
  const { bookingFeeDue, campFeeDue } = buildBillContent(
    [registration({ shiftNr: 3 })],
    SHIFTS,
    new Date("2027-06-20T10:00:00.000Z"),
  );
  assert.equal(bookingFeeDue.toISOString(), "2027-06-23T00:00:00.000Z");
  assert.equal(campFeeDue.toISOString(), "2027-06-23T00:00:00.000Z");
});

void test("an empty list or a missing shift is an error", () => {
  assert.throws(() => buildBillContent([], SHIFTS, ISSUED_AT));
  assert.throws(() =>
    buildBillContent([registration({ shiftNr: 4 })], SHIFTS, ISSUED_AT),
  );
});
