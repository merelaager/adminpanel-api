import "../helpers/test-env";
import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";

import nodemailer from "nodemailer";

import { createMailgunTransport } from "#app/lib/mailgun-transport";

const OPTIONS = {
  apiKey: "key-123",
  domain: "mg.example.test",
  host: "api.eu.mailgun.net",
};

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

// Replaces global fetch with one that records each request and answers with
// the given status and body.
const mockFetch = (status: number, body = "") => {
  const requests: CapturedRequest[] = [];
  mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Promise.resolve(new Response(body, { status }));
  });
  return requests;
};

const createMailer = () =>
  nodemailer.createTransport(createMailgunTransport(OPTIONS));

afterEach(() => {
  mock.restoreAll();
});

void test("send posts the built MIME message to the messages.mime endpoint", async () => {
  const requests = mockFetch(200, '{"id":"<1@mg>","message":"Queued."}');

  const info = await createMailer().sendMail({
    from: { name: "Merelaager — süsteem", address: "no-reply@example.test" },
    to: "parent@example.test",
    cc: ["staff@example.test"],
    bcc: "archive@example.test",
    subject: "Broneeringu kinnitus",
    html: "<p>Tere</p>",
    attachments: [
      {
        filename: "arve_1.pdf",
        contentType: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
    ],
  });

  assert.equal(requests.length, 1);
  const [{ url, init }] = requests;
  assert.equal(
    url,
    "https://api.eu.mailgun.net/v3/mg.example.test/messages.mime",
  );
  assert.equal(init.method, "POST");
  assert.deepEqual(init.headers, {
    Authorization: `Basic ${Buffer.from("api:key-123").toString("base64")}`,
  });

  const form = init.body as FormData;
  assert.deepEqual(form.getAll("to"), [
    "parent@example.test",
    "staff@example.test",
    "archive@example.test",
  ]);

  const message = await (form.get("message") as Blob).text();
  assert.match(message, /^Subject: Broneeringu kinnitus\r$/m);
  assert.match(message, /^Cc: staff@example.test\r$/m);
  assert.match(message, /filename=arve_1\.pdf/);
  assert.doesNotMatch(message, /^Bcc:/m);

  assert.match(info.messageId, /^<.+@.+>$/);
  assert.match(message, new RegExp(`^Message-ID: ${info.messageId}\r$`, "m"));
  assert.deepEqual(info.envelope.to, form.getAll("to"));
});

void test("send rejects with Mailgun's status and body when the request fails", async () => {
  mockFetch(401, "Forbidden");

  await assert.rejects(
    createMailer().sendMail({
      from: "no-reply@example.test",
      to: "parent@example.test",
      subject: "Test",
      text: "Test",
    }),
    { message: "Mailgun rejected the message: 401 Forbidden" },
  );
});

void test("verify succeeds when Mailgun rejects the empty message as invalid", async () => {
  const requests = mockFetch(400, '{"message":"to parameter is missing"}');

  assert.equal(await createMailer().verify(), true);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "https://api.eu.mailgun.net/v3/mg.example.test/messages.mime",
  );
});

void test("verify fails on a bad API key or unknown domain", async () => {
  mockFetch(401, "Forbidden");

  await assert.rejects(createMailer().verify(), {
    message: "Mailgun verification failed: 401 Forbidden",
  });
});

void test("verify fails when Mailgun has a server error", async () => {
  mockFetch(500, "Internal Server Error");

  await assert.rejects(createMailer().verify(), /verification failed: 500/);
});
