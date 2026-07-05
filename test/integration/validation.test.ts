import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb } from "../helpers/db";
import {
  createShiftInfo,
  createUser,
  createChildWithRegistration,
  loginAs,
} from "../helpers/fixtures";

interface FailResponse {
  status: string;
  data: Record<string, unknown>;
}

let app: FastifyInstance;
let cookie: string;
let regId = 0;

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createUser({
    username: "boss",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  const { registration } = await createChildWithRegistration({
    name: "Validation Camper",
    shiftNr: 1,
  });
  regId = registration.id;
  app = await build();
  cookie = await loginAs(app, "boss");
});

after(async () => {
  await app.close();
});

void test("negative pricePaid is a 400 keyed on the field", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: `/api/registrations/${regId}`,
    headers: { cookie },
    payload: { pricePaid: -5 },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json<FailResponse>();
  assert.equal(body.status, "fail");
  assert.ok("pricePaid" in body.data);
});

void test("negative priceToPay is a 400", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: `/api/registrations/${regId}`,
    headers: { cookie },
    payload: { priceToPay: -1 },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json<FailResponse>().status, "fail");
});

void test("an out-of-range tent score is a 400 on both bounds", async () => {
  const low = await app.inject({
    method: "POST",
    url: "/api/shifts/1/tents/1",
    headers: { cookie },
    payload: { score: -1 },
  });
  assert.equal(low.statusCode, 400);

  const high = await app.inject({
    method: "POST",
    url: "/api/shifts/1/tents/1",
    headers: { cookie },
    payload: { score: 9999 },
  });
  assert.equal(high.statusCode, 400);
});

void test("an unknown field is rejected (additionalProperties: false)", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: `/api/registrations/${regId}`,
    headers: { cookie },
    payload: { unknownField: 1 },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json<FailResponse>().status, "fail");
});

void test("an invalid app platform enum is a 400", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/app/version?platform=windows",
  });
  assert.equal(res.statusCode, 400);
});
