import "../helpers/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";

import { getAgeAtDate } from "#app/lib/age";

const birthday = new Date(Date.UTC(2010, 5, 15)); // 2010-06-15

void test("getAgeAtDate: birthday later in the target year (not yet reached)", () => {
  // Target 2020-03-01 is before the June birthday, so still 9.
  assert.equal(getAgeAtDate(birthday, new Date(Date.UTC(2020, 2, 1))), 9);
});

void test("getAgeAtDate: exact birthday counts as the new age", () => {
  assert.equal(getAgeAtDate(birthday, new Date(Date.UTC(2020, 5, 15))), 10);
});

void test("getAgeAtDate: the day before the birthday is still the old age", () => {
  assert.equal(getAgeAtDate(birthday, new Date(Date.UTC(2020, 5, 14))), 9);
});

void test("getAgeAtDate: same month but an earlier day is the old age", () => {
  assert.equal(getAgeAtDate(birthday, new Date(Date.UTC(2020, 5, 1))), 9);
});
