import "../helpers/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";

import { computePrice } from "#app/routes/api/registrations/create.service";
import { SHIFT_PRICES, SENIORITY_DISCOUNTS } from "#app/constants/pricing";

// Expected values are derived from the pricing constants so they track any
// future change to those tables rather than being independently hardcoded.
void test("computePrice: shift 1, new camper", () => {
  assert.equal(computePrice(1, false), SHIFT_PRICES[0]);
});

void test("computePrice: shift 1, returning camper (seniority discount)", () => {
  assert.equal(computePrice(1, true), SHIFT_PRICES[0] - SENIORITY_DISCOUNTS[0]);
});

void test("computePrice: shift 2, new camper", () => {
  assert.equal(computePrice(2, false), SHIFT_PRICES[1]);
});

void test("computePrice: shift 2, returning camper (seniority discount)", () => {
  assert.equal(computePrice(2, true), SHIFT_PRICES[1] - SENIORITY_DISCOUNTS[1]);
});

void test("computePrice: shift 0 is out of range", () => {
  assert.equal(computePrice(0, false), -1);
});

void test("computePrice: shift 5 is out of range", () => {
  assert.equal(computePrice(5, false), -1);
});
