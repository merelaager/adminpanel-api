import { test } from "node:test";
import assert from "node:assert/strict";

import "../helpers/test-env";

import {
  computeBillStandings,
  type BillForStatus,
} from "#app/services/billing/bill-status.service";

// A bill for one child: 360 € in total, 100 € of it booking fee.
const bill = (overrides: Partial<BillForStatus> = {}): BillForStatus => ({
  voidedAt: null,
  bookingFeeDue: new Date("2027-01-04T00:00:00.000Z"),
  campFeeDue: new Date("2027-05-23T00:00:00.000Z"),
  items: [{ amount: 36000, bookingFee: 10000 }],
  ...overrides,
});

const JANUARY = new Date("2027-01-02T12:00:00.000Z");
const FEBRUARY = new Date("2027-02-01T12:00:00.000Z");
const JUNE = new Date("2027-06-01T12:00:00.000Z");

const standingOf = (bills: BillForStatus[], paid: number, now: Date) =>
  computeBillStandings(bills, paid, now)[0];

void test("an unpaid bill before its deadlines is open", () => {
  assert.deepEqual(standingOf([bill()], 0, JANUARY), {
    status: "open",
    paidCents: 0,
    totalCents: 36000,
  });
});

void test("a fully paid bill is paid", () => {
  assert.equal(standingOf([bill()], 36000, JUNE).status, "paid");
});

void test("overpaying a bill counts only its total", () => {
  assert.equal(standingOf([bill()], 50000, JANUARY).paidCents, 36000);
});

void test("a paid booking fee shows until the camp-fee deadline", () => {
  assert.equal(
    standingOf([bill()], 10000, FEBRUARY).status,
    "booking-fee-paid",
  );
});

void test("a partly paid booking fee before its deadline is open", () => {
  assert.equal(standingOf([bill()], 5000, JANUARY).status, "open");
});

void test("the booking fee counts as paid only once every child's is covered", () => {
  const twoChildren = bill({
    items: [
      { amount: 36000, bookingFee: 10000 },
      { amount: 36000, bookingFee: 10000 },
    ],
  });
  assert.equal(standingOf([twoChildren], 10000, JANUARY).status, "open");
  assert.equal(
    standingOf([twoChildren], 20000, JANUARY).status,
    "booking-fee-paid",
  );
});

void test("a bill without booking fees is open until paid", () => {
  const noBookingFee = bill({ items: [{ amount: 36000, bookingFee: 0 }] });
  assert.equal(standingOf([noBookingFee], 0, JANUARY).status, "open");
});

void test("an unpaid booking fee after its deadline is overdue", () => {
  assert.equal(
    standingOf([bill()], 5000, FEBRUARY).status,
    "booking-fee-overdue",
  );
});

void test("a deadline is not missed during its own day", () => {
  const dueDay = new Date("2027-01-04T20:00:00.000Z");
  assert.equal(standingOf([bill()], 0, dueDay).status, "open");
});

void test("an unpaid camp fee after its deadline is overdue", () => {
  assert.equal(standingOf([bill()], 10000, JUNE).status, "camp-fee-overdue");
});

void test("payments fill the account's bills by due date", () => {
  const second = bill({
    bookingFeeDue: new Date("2027-01-10T00:00:00.000Z"),
    campFeeDue: new Date("2027-06-07T00:00:00.000Z"),
  });
  // Both booking fees come before either camp fee.
  const standings = computeBillStandings([bill(), second], 20000, FEBRUARY);
  assert.deepEqual(
    [standings[0].paidCents, standings[1].paidCents],
    [10000, 10000],
  );
  assert.equal(standings[1].status, "booking-fee-paid");
});

void test("a void bill takes no payments", () => {
  const standings = computeBillStandings(
    [bill({ voidedAt: JANUARY }), bill()],
    36000,
    JANUARY,
  );
  assert.deepEqual(standings[0], {
    status: "void",
    paidCents: 0,
    totalCents: 36000,
  });
  assert.equal(standings[1].status, "paid");
});

void test("refunds beyond the payments leave nothing paid", () => {
  assert.equal(standingOf([bill()], -5000, JANUARY).paidCents, 0);
});
