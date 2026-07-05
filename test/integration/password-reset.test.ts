import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import { createShiftInfo, createUser, loginAs } from "../helpers/fixtures";

interface JsendResponse {
  status: string;
  data: Record<string, unknown>;
}

let app: FastifyInstance;
let carolId: number;
let carolSession: string;

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  const carol = await createUser({
    username: "carol",
    email: "carol@test.invalid",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  carolId = carol.id;
  app = await build();

  // A pre-existing session that must be invalidated once the password is reset.
  carolSession = await loginAs(app, "carol");
});

after(async () => {
  await app.close();
});

void test("request for an unknown email is 202 with no token created", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/account/password-reset",
    payload: { email: "stranger@test.invalid" },
  });
  assert.equal(res.statusCode, 202);

  const count = await prisma.resetToken.count();
  assert.equal(count, 0);
});

void test("request for a known email is 202 and creates a token", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/account/password-reset",
    payload: { email: "carol@test.invalid" },
  });
  assert.equal(res.statusCode, 202);

  const token = await prisma.resetToken.findFirst({
    where: { userId: carolId },
  });
  assert.ok(token, "a reset token row exists for carol");
});

void test("confirm with a bad token is forbidden", async () => {
  const res = await app.inject({
    method: "PUT",
    url: "/api/account/password",
    payload: { token: "not-a-real-token", password: "brand-new-pass-1" },
  });
  assert.equal(res.statusCode, 403);
});

void test("confirm with a weak password is 422 and keeps the token", async () => {
  const token = await prisma.resetToken.findFirstOrThrow({
    where: { userId: carolId },
  });

  const res = await app.inject({
    method: "PUT",
    url: "/api/account/password",
    payload: { token: token.token, password: "1234567" },
  });
  assert.equal(res.statusCode, 422);
  assert.ok(res.json<JsendResponse>().data.password);

  const stillThere = await prisma.resetToken.findUnique({
    where: { token: token.token },
  });
  assert.ok(stillThere, "the token survives a weak-password attempt");
});

void test("confirm with a good password resets it and clears tokens + sessions", async () => {
  const token = await prisma.resetToken.findFirstOrThrow({
    where: { userId: carolId },
  });

  const res = await app.inject({
    method: "PUT",
    url: "/api/account/password",
    payload: { token: token.token, password: "brand-new-pass-1" },
  });
  assert.equal(res.statusCode, 204);

  // The new password works.
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "carol", password: "brand-new-pass-1" },
  });
  assert.equal(login.statusCode, 200);

  // All of carol's reset tokens are gone.
  const remaining = await prisma.resetToken.count({
    where: { userId: carolId },
  });
  assert.equal(remaining, 0);

  // The pre-existing session was invalidated.
  const me = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: carolSession },
  });
  assert.equal(me.statusCode, 401);
});

void test("confirm with an expired token is forbidden and deletes the token", async () => {
  const expired = await prisma.resetToken.create({
    data: {
      token: crypto.randomUUID(),
      userId: carolId,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    },
  });

  const res = await app.inject({
    method: "PUT",
    url: "/api/account/password",
    payload: { token: expired.token, password: "another-new-pass-1" },
  });
  assert.equal(res.statusCode, 403);

  const gone = await prisma.resetToken.findUnique({
    where: { token: expired.token },
  });
  assert.equal(gone, null);
});
