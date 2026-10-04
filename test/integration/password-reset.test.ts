import { before, after, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import { createShiftInfo, createUser, loginAs } from "../helpers/fixtures";
import { captureMail, tokenFromMail, type MailCapture } from "../helpers/mail";
import { createToken, hashToken } from "#app/lib/tokens";
import { requestPasswordReset } from "#app/routes/api/account/account.service";

interface JsendResponse {
  status: string;
  data: Record<string, unknown>;
}

let app: FastifyInstance;
let carolId: number;
let carolSession: string;
let mail: MailCapture;
// The token emailed to carol.
let resetToken = "";

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
  mail = captureMail(app);

  // A pre-existing session that must be invalidated once the password is reset.
  carolSession = await loginAs(app, "carol");
});

after(async () => {
  await app.close();
});

void test("request for an unknown email is 202", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/account/password-reset",
    payload: { email: "stranger@test.invalid" },
  });
  assert.equal(res.statusCode, 202);
});

// The route doesn't wait for the work, so this checks the service directly.
void test("an unknown email creates no token and sends no email", async () => {
  await requestPasswordReset(
    "stranger@test.invalid",
    app.mailer,
    app.config.APP_URL,
    app.log,
  );
  assert.equal(await prisma.resetToken.count(), 0);
  assert.equal(mail.sent.length, 0);
});

void test("request for a known email emails a token and stores only its hash", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/account/password-reset",
    payload: { email: "carol@test.invalid" },
  });
  assert.equal(res.statusCode, 202);

  const message = await mail.next();
  assert.equal(message.to, "carol@test.invalid");
  resetToken = tokenFromMail(message);

  const row = await prisma.resetToken.findFirstOrThrow({
    where: { userId: carolId },
  });
  assert.equal(row.tokenHash, hashToken(resetToken));
  assert.notEqual(row.tokenHash, resetToken);
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
  const res = await app.inject({
    method: "PUT",
    url: "/api/account/password",
    payload: { token: resetToken, password: "1234567" },
  });
  assert.equal(res.statusCode, 422);
  assert.ok(res.json<JsendResponse>().data.password);

  const stillThere = await prisma.resetToken.findUnique({
    where: { tokenHash: hashToken(resetToken) },
  });
  assert.ok(stillThere, "the token survives a weak-password attempt");
});

void test("confirm with a good password resets it and clears tokens + sessions", async () => {
  const res = await app.inject({
    method: "PUT",
    url: "/api/account/password",
    payload: { token: resetToken, password: "brand-new-pass-1" },
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
  const { token, tokenHash } = createToken();
  await prisma.resetToken.create({
    data: {
      tokenHash,
      userId: carolId,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    },
  });

  const res = await app.inject({
    method: "PUT",
    url: "/api/account/password",
    payload: { token, password: "another-new-pass-1" },
  });
  assert.equal(res.statusCode, 403);

  const gone = await prisma.resetToken.findUnique({ where: { tokenHash } });
  assert.equal(gone, null);
});

void test("request responds without waiting for the email to be sent", async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sendMail = mock.method(app.mailer, "sendMail", () => held);

  const timeout = new Promise<"timed out">((resolve) =>
    setTimeout(() => resolve("timed out"), 1000),
  );
  const res = await Promise.race([
    app.inject({
      method: "POST",
      url: "/api/account/password-reset",
      payload: { email: "carol@test.invalid" },
    }),
    timeout,
  ]);

  release();
  sendMail.mock.restore();
  assert.notEqual(res, "timed out");
  assert.equal(res !== "timed out" && res.statusCode, 202);
});
