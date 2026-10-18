import { test } from "node:test";
import assert from "node:assert/strict";

import "../helpers/test-env";

import {
  createReferenceNumber,
  getReferenceCheckDigit,
  isValidReferenceNumber,
} from "#app/lib/reference-number";

void test("getReferenceCheckDigit: 1234 → 4", () => {
  assert.equal(getReferenceCheckDigit("1234"), 4);
});

void test("getReferenceCheckDigit: 20270001 → 4", () => {
  assert.equal(getReferenceCheckDigit("20270001"), 4);
});

void test("getReferenceCheckDigit: a sum divisible by ten gives 0", () => {
  assert.equal(getReferenceCheckDigit("20270003"), 0);
});

void test("getReferenceCheckDigit: a single-digit base (1 → 3)", () => {
  assert.equal(getReferenceCheckDigit("1"), 3);
});

void test("getReferenceCheckDigit: leading zeros count as digits", () => {
  assert.equal(getReferenceCheckDigit("0123"), 2);
});

void test("getReferenceCheckDigit: accepts a 19-digit base", () => {
  assert.doesNotThrow(() => getReferenceCheckDigit("1".repeat(19)));
});

void test("getReferenceCheckDigit: rejects an empty, too long or non-digit base", () => {
  assert.throws(() => getReferenceCheckDigit(""));
  assert.throws(() => getReferenceCheckDigit("1".repeat(20)));
  assert.throws(() => getReferenceCheckDigit("2027 0001"));
  assert.throws(() => getReferenceCheckDigit("12a4"));
});

void test("createReferenceNumber appends the check digit", () => {
  assert.equal(createReferenceNumber("1234"), "12344");
  assert.equal(createReferenceNumber("20270003"), "202700030");
});

void test("isValidReferenceNumber accepts created references", () => {
  for (const base of ["1", "1234", "20270001", "20270003", "9".repeat(19)]) {
    assert.ok(isValidReferenceNumber(createReferenceNumber(base)), base);
  }
});

void test("isValidReferenceNumber rejects a wrong check digit", () => {
  assert.equal(isValidReferenceNumber("12345"), false);
});

void test("isValidReferenceNumber rejects a single-digit typo", () => {
  assert.ok(isValidReferenceNumber("202700014"));
  assert.equal(isValidReferenceNumber("202700054"), false);
});

void test("isValidReferenceNumber rejects bad lengths and non-digits", () => {
  assert.equal(isValidReferenceNumber(""), false);
  assert.equal(isValidReferenceNumber("3"), false);
  assert.equal(isValidReferenceNumber("1".repeat(21)), false);
  assert.equal(isValidReferenceNumber("2027 00014"), false);
});
