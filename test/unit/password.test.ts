import "../helpers/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";

import argon2 from "argon2";
import bcrypt from "bcrypt";

import {
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "#app/lib/password";

void test("validatePasswordPolicy: a 7-character password returns a message", () => {
  const result = validatePasswordPolicy("1234567");
  assert.equal(typeof result, "string");
  assert.ok(result);
});

void test("validatePasswordPolicy: an 8-character password passes (null)", () => {
  assert.equal(validatePasswordPolicy("12345678"), null);
});

void test("hashPassword: produces an argon2id hash that verifies without needing a rehash", async () => {
  const hash = await hashPassword("test-password");
  assert.match(hash, /^\$argon2id\$/);
  assert.deepEqual(await verifyPassword(hash, "test-password"), {
    valid: true,
    needsRehash: false,
  });
});

void test("verifyPassword: rejects a wrong password for an argon2id hash", async () => {
  const hash = await hashPassword("test-password");
  assert.equal((await verifyPassword(hash, "wrong-password")).valid, false);
});

void test("verifyPassword: accepts a bcrypt hash and flags it for rehashing", async () => {
  const hash = bcrypt.hashSync("test-password", 4);
  assert.deepEqual(await verifyPassword(hash, "test-password"), {
    valid: true,
    needsRehash: true,
  });
  assert.equal((await verifyPassword(hash, "wrong-password")).valid, false);
});

void test("verifyPassword: flags an argon2id hash with weaker parameters for rehashing", async () => {
  const hash = await argon2.hash("test-password", {
    type: argon2.argon2id,
    timeCost: 2,
  });
  assert.deepEqual(await verifyPassword(hash, "test-password"), {
    valid: true,
    needsRehash: true,
  });
});
