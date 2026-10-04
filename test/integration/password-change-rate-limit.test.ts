import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import "../helpers/test-env";
import { buildApp } from "#app/app";
import { resetDb } from "../helpers/db";
import { createShiftInfo, createUser, loginAs } from "../helpers/fixtures";

// The shared build helper disables rate limiting, so we must build our own.
let app: FastifyInstance;
let aliceCookie = "";
let bobCookie = "";

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createUser({ username: "alice" });
  await createUser({ username: "bob" });
  app = buildApp({ docs: false });
  await app.ready();
  aliceCookie = await loginAs(app, "alice");
  bobCookie = await loginAs(app, "bob");
});

after(async () => {
  await app.close();
});

const changePassword = (cookie: string) =>
  app.inject({
    method: "POST",
    url: "/api/auth/password",
    headers: { cookie },
    payload: { currentPassword: "wrong-password", password: "new-password-1" },
  });

void test("password change is limited to 5 attempts per user", async () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal((await changePassword(aliceCookie)).statusCode, 401);
  }
  assert.equal((await changePassword(aliceCookie)).statusCode, 429);
});

void test("the limit is per user, not per IP", async () => {
  assert.equal((await changePassword(bobCookie)).statusCode, 401);
});
