import { mock } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { SendMailOptions } from "nodemailer";

export interface MailCapture {
  // Messages sent so far in sending order.
  sent: SendMailOptions[];
  // Resolves with the next unread message, waiting if it hasn't been sent yet.
  next: () => Promise<SendMailOptions>;
}

const NEXT_TIMEOUT_MS = 2000;

// Records messages instead of sending them.
export const captureMail = (app: FastifyInstance): MailCapture => {
  const sent: SendMailOptions[] = [];
  const waiting: ((message: SendMailOptions) => void)[] = [];
  let taken = 0;

  mock.method(app.mailer, "sendMail", (message: SendMailOptions) => {
    sent.push(message);
    waiting.shift()?.(message);
    return Promise.resolve({});
  });

  const next = (): Promise<SendMailOptions> => {
    if (taken < sent.length) return Promise.resolve(sent[taken++]);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("no email was sent")),
        NEXT_TIMEOUT_MS,
      );
      waiting.push((message) => {
        clearTimeout(timer);
        taken++;
        resolve(message);
      });
    });
  };

  return { sent, next };
};

export const tokenFromMail = (message: SendMailOptions): string => {
  assert.equal(typeof message.text, "string");
  const link = /https?:\/\/\S+/.exec(message.text as string)?.[0];
  assert.ok(link, "the email contains a link");

  const token = new URL(link).searchParams.get("token");
  assert.ok(token, "the link has a token");
  return token;
};
