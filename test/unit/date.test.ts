import "../helpers/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  startOfUTCDay,
  addUTCDays,
  subUTCMonths,
  formatUTCDate,
} from "#app/lib/date";

void test("startOfUTCDay truncates the time component in the UTC frame", () => {
  const result = startOfUTCDay(new Date("2023-06-15T13:45:30.500Z"));
  assert.equal(result.toISOString(), "2023-06-15T00:00:00.000Z");
});

void test("addUTCDays rolls over a month and year boundary", () => {
  const result = addUTCDays(new Date(Date.UTC(2022, 11, 31)), 1);
  assert.equal(result.toISOString(), "2023-01-01T00:00:00.000Z");
});

void test("subUTCMonths overflows a non-existent day into the next month", () => {
  // Mar 31 minus one month = Feb 31, which the Date constructor rolls forward
  // to Mar 3 (2023 is not a leap year).
  const result = subUTCMonths(new Date(Date.UTC(2023, 2, 31)), 1);
  assert.equal(result.toISOString(), "2023-03-03T00:00:00.000Z");
});

void test("formatUTCDate formats in the UTC frame for an explicit locale", () => {
  const result = formatUTCDate(new Date(Date.UTC(2023, 0, 15)), "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  assert.equal(result, "15/01/2023");
});
