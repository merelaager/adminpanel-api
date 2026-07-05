import "../helpers/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";

import { validatePasswordPolicy } from "#app/lib/password";

void test("validatePasswordPolicy: a 7-character password returns a message", () => {
  const result = validatePasswordPolicy("1234567");
  assert.equal(typeof result, "string");
  assert.ok(result);
});

void test("validatePasswordPolicy: an 8-character password passes (null)", () => {
  assert.equal(validatePasswordPolicy("12345678"), null);
});
