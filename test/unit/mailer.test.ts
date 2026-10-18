import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import type { FastifyBaseLogger } from "fastify";

import "../helpers/test-env";

import {
  createMailer,
  redirectAllMail,
  sendsRealMail,
  type MailerConfig,
} from "#app/lib/mailer";

type JsonInfo = { envelope: { to: string[] }; message: string };

const config = (overrides: Partial<MailerConfig>): MailerConfig => ({
  NODE_ENV: "development",
  MAILGUN_API_KEY: "key",
  EMAIL_SERV: "mail.test.invalid",
  ...overrides,
});

const message = {
  from: "no-reply@test.invalid",
  to: "parent@test.invalid",
  cc: ["boss1@test.invalid", { name: "Boss", address: "boss2@test.invalid" }],
  bcc: "owner@test.invalid",
  subject: "Broneeringu kinnitus",
  text: "Tere!",
};

void test("redirected mail goes only to the redirect address", async () => {
  const transporter = nodemailer.createTransport({ jsonTransport: true });
  redirectAllMail(transporter, "dev@test.invalid");

  const info = (await transporter.sendMail(message)) as JsonInfo;
  assert.deepEqual(info.envelope.to, ["dev@test.invalid"]);

  const sent = JSON.parse(info.message) as { subject: string; cc?: unknown };
  assert.equal(
    sent.subject,
    "[to: parent@test.invalid, cc: boss1@test.invalid, boss2@test.invalid, bcc: owner@test.invalid] Broneeringu kinnitus",
  );
  assert.equal(sent.cc, undefined);
});

void test("development without a redirect logs mail instead of sending", async () => {
  const logged: string[] = [];
  const log = {
    info: (text: string) => logged.push(text),
  } as unknown as FastifyBaseLogger;

  const transporter = createMailer(config({}), log);
  await transporter.sendMail(message);

  assert.equal(logged.length, 1);
  assert.match(logged[0], /^Email not sent/);
  assert.match(logged[0], /to: parent@test\.invalid/);
  assert.match(logged[0], /subject: Broneeringu kinnitus/);
});

void test("only production, or development with a redirect, sends real mail", () => {
  assert.equal(sendsRealMail(config({ NODE_ENV: "production" })), true);
  assert.equal(
    sendsRealMail(config({ MAIL_REDIRECT_TO: "dev@test.invalid" })),
    true,
  );
  assert.equal(sendsRealMail(config({})), false);
  assert.equal(sendsRealMail(config({ NODE_ENV: "test" })), false);
});
