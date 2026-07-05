import "../helpers/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseIdCode } from "#app/routes/api/registrations/create.service";

void test("parseIdCode parses a valid male code (leading 5)", () => {
  const result = parseIdCode("50505050505");
  assert.deepEqual(result, {
    sex: "M",
    dob: "2005-05-05T00:00:00.000Z",
  });
});

void test("parseIdCode parses a valid female code (leading 6)", () => {
  const result = parseIdCode("60505050505");
  assert.deepEqual(result, {
    sex: "F",
    dob: "2005-05-05T00:00:00.000Z",
  });
});

void test("parseIdCode rejects a code whose length is not 11", () => {
  assert.ok("error" in parseIdCode("123"));
});

void test("parseIdCode rejects a code with non-digit characters", () => {
  assert.ok("error" in parseIdCode("5050505050a"));
});

void test("parseIdCode rejects an adult leading digit (3)", () => {
  assert.ok("error" in parseIdCode("35050505050"));
});

void test("parseIdCode rejects an impossible month (13)", () => {
  assert.ok("error" in parseIdCode("50513050505"));
});

void test("parseIdCode rejects an impossible day (Feb 30)", () => {
  assert.ok("error" in parseIdCode("50402300000"));
});

void test("parseIdCode accepts a valid leap day (Feb 29, 2004)", () => {
  const result = parseIdCode("50402290000");
  assert.deepEqual(result, {
    sex: "M",
    dob: "2004-02-29T00:00:00.000Z",
  });
});
