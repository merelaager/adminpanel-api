import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb } from "../helpers/db";
import {
  TEST_PASSWORD,
  createShiftInfo,
  createUser,
  loginAs,
} from "../helpers/fixtures";

interface JsendResponse {
  status: string;
  data: Record<string, unknown>;
}

let app: FastifyInstance;
let aliceId: number;

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  const alice = await createUser({
    username: "alice",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  aliceId = alice.id;
  app = await build();
});

after(async () => {
  await app.close();
});

void test("login succeeds and returns the user info with a session cookie", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "alice", password: TEST_PASSWORD },
  });
  assert.equal(res.statusCode, 200);

  const body = res.json<JsendResponse>();
  assert.equal(body.status, "success");
  assert.equal(body.data.userId, aliceId);
  assert.equal(body.data.isRoot, false);
  assert.ok((body.data.managedShifts as number[]).includes(1));

  assert.ok(res.cookies.some((c) => c.name === "sessionId"));
});

void test("login normalises the username (trim + lowercase)", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "  ALICE  ", password: TEST_PASSWORD },
  });
  assert.equal(res.statusCode, 200);
});

void test("login with the wrong password fails without enumeration", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "alice", password: "wrong-password" },
  });
  assert.equal(res.statusCode, 401);
  const body = res.json<JsendResponse>();
  assert.equal(body.status, "fail");
  assert.ok(body.data.message);
});

void test("login for an unknown user fails identically", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "nobody", password: "wrong-password" },
  });
  assert.equal(res.statusCode, 401);
  const body = res.json<JsendResponse>();
  assert.equal(body.status, "fail");
  assert.ok(body.data.message);
});

void test("GET /api/auth/me returns the user info with a cookie, 401 without", async () => {
  const cookie = await loginAs(app, "alice");

  const withCookie = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie },
  });
  assert.equal(withCookie.statusCode, 200);
  const body = withCookie.json<JsendResponse>();
  assert.equal(body.data.userId, aliceId);
  assert.ok("managedShifts" in body.data);

  const withoutCookie = await app.inject({ method: "GET", url: "/api/auth/me" });
  assert.equal(withoutCookie.statusCode, 401);
});

void test("logout invalidates the session", async () => {
  const cookie = await loginAs(app, "alice");

  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: { cookie },
  });
  assert.equal(logout.statusCode, 204);

  const me = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie },
  });
  assert.equal(me.statusCode, 401);
});

// Kept last: it changes alice's password, after which TEST_PASSWORD no longer
// works for her.
void test("password change: validation, session handling, and re-login", async () => {
  const cookieA = await loginAs(app, "alice");
  const cookieB = await loginAs(app, "alice");
  const newPassword = "new-password-456";

  // Wrong current password.
  const wrong = await app.inject({
    method: "POST",
    url: "/api/auth/password",
    headers: { cookie: cookieA },
    payload: { currentPassword: "not-it", password: newPassword },
  });
  assert.equal(wrong.statusCode, 401);

  // New password too short.
  const weak = await app.inject({
    method: "POST",
    url: "/api/auth/password",
    headers: { cookie: cookieA },
    payload: { currentPassword: TEST_PASSWORD, password: "1234567" },
  });
  assert.equal(weak.statusCode, 422);

  // Valid change.
  const ok = await app.inject({
    method: "POST",
    url: "/api/auth/password",
    headers: { cookie: cookieA },
    payload: { currentPassword: TEST_PASSWORD, password: newPassword },
  });
  assert.equal(ok.statusCode, 204);

  // The acting session (A) is kept; the other session (B) is invalidated.
  const meA = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: cookieA },
  });
  assert.equal(meA.statusCode, 200);

  const meB = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: cookieB },
  });
  assert.equal(meB.statusCode, 401);

  // The new password works; the old one does not.
  const newLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "alice", password: newPassword },
  });
  assert.equal(newLogin.statusCode, 200);

  const oldLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "alice", password: TEST_PASSWORD },
  });
  assert.equal(oldLogin.statusCode, 401);
});
