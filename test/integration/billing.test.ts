import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import "../helpers/test-env";

import { REGISTRATION_FEE } from "#app/constants/pricing";
import { computePrice } from "#app/routes/api/registrations/create.service";
import { isValidReferenceNumber } from "#app/lib/reference-number";
import type { BillSummary } from "#app/routes/api/bills/bills.schemas";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import { captureMail, type MailCapture } from "../helpers/mail";
import {
  createShiftInfo,
  createUser,
  createChildWithRegistration,
  loginAs,
} from "../helpers/fixtures";

let app: FastifyInstance;
let mail: MailCapture;
const cookies: Record<string, string> = {};

type FailBody = { data: { email?: string; registrations?: string } };

const PARENT = "parent@test.invalid";
const regIds: Record<string, number> = {};

const addChild = async (
  name: string,
  shiftNr: number,
  email: string,
  isRegistered: boolean,
) => {
  const { registration } = await createChildWithRegistration({
    name,
    shiftNr,
    overrides: {
      contactEmail: email,
      contactName: "Parent Name",
      isRegistered,
      isOld: false,
      priceToPay: computePrice(shiftNr, false),
    },
  });
  regIds[name] = registration.id;
};

before(async () => {
  await resetDb();
  await createShiftInfo(1, { length: 7 });
  await createShiftInfo(2);
  await createShiftInfo(3);

  for (const shiftNr of [1, 2, 3]) {
    await createUser({
      username: `boss${shiftNr}`,
      roles: [{ shiftNr, roleName: "boss" }],
    });
  }
  await createUser({
    username: "owner",
    roles: [{ shiftNr: 1, roleName: "root" }],
  });

  await addChild("Liis", 1, PARENT, true);
  await addChild("Peeter", 2, PARENT, true);
  await addChild("Mari", 3, PARENT, false);

  app = await build();
  mail = captureMail(app);
  for (const username of ["boss1", "boss2", "boss3", "owner"]) {
    cookies[username] = await loginAs(app, username);
  }
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

const post = (as: string, url: string, email: string) =>
  app.inject({
    method: "POST",
    url,
    headers: { cookie: cookies[as] },
    payload: { email },
  });

const send = (as: string, email: string) =>
  post(as, "/api/notifications/bills", email);

const billOf = (registrationId: number) =>
  prisma.bill.findFirstOrThrow({
    where: { items: { some: { registrationId } } },
    include: { items: { orderBy: { position: "asc" } }, account: true },
  });

void test("a shift without accepted children has nothing to bill", async () => {
  const res = await send("boss3", PARENT);
  assert.equal(res.statusCode, 404);
  assert.ok("registrations" in res.json<FailBody>().data);
  assert.equal(mail.sent.length, 0);
});

void test("sending bills all accepted children of the parent, across shifts", async () => {
  const res = await send("boss1", PARENT);
  assert.equal(res.statusCode, 204);

  const bill = await billOf(regIds.Liis);
  assert.deepEqual(
    bill.items.map((item) => [item.childName, item.shiftNr, item.amount]),
    [
      ["Liis", 1, computePrice(1, false) * 100],
      ["Peeter", 2, computePrice(2, false) * 100],
    ],
  );
  assert.equal(bill.items[0].description, "7päevane vahetus uuele tulijale");
  assert.notEqual(bill.sentAt, null);
  assert.ok(isValidReferenceNumber(bill.account.reference));
});

void test("the bill email lists every child and attaches the PDF", async () => {
  const message = await mail.next();
  const bill = await billOf(regIds.Liis);
  const html = message.html as string;

  assert.equal(message.to, PARENT);
  assert.ok(!html.includes(bill.account.reference));
  assert.ok(html.includes("Liis"));
  assert.ok(html.includes("Peeter"));
  assert.ok(
    html.includes("<li>Mari (3. vahetus)</li></ul><p>on reservnimekirjas."),
  );

  const [attachment] = message.attachments ?? [];
  assert.equal(attachment.filename, `arve_${bill.number}.pdf`);
  assert.ok(
    (attachment.content as Buffer).subarray(0, 4).equals(Buffer.from("%PDF")),
  );
});

void test("the PDF is stored once, under the bill number", async () => {
  const bill = await billOf(regIds.Liis);
  const file = path.join(process.env.DATA_DIR!, "arved", `${bill.number}.pdf`);
  assert.ok(fs.existsSync(file));
});

void test("sending again reports the existing bill and sends nothing", async () => {
  const bill = await billOf(regIds.Liis);
  const res = await send("boss2", PARENT);
  assert.equal(res.statusCode, 404);
  assert.match(
    res.json<FailBody>().data.registrations ?? "",
    new RegExp(`${bill.number}`),
  );
  assert.equal(mail.sent.length, 1);
});

void test("a bill opens for campmasters of its shifts only", async () => {
  const bill = await billOf(regIds.Liis);
  const get = (as: string) =>
    app.inject({
      method: "GET",
      url: `/api/bills/${bill.number}`,
      headers: { cookie: cookies[as] },
    });

  const own = await get("boss2");
  assert.equal(own.statusCode, 200);
  assert.equal(own.headers["content-type"], "application/pdf");
  assert.ok(own.rawPayload.subarray(0, 4).equals(Buffer.from("%PDF")));

  assert.equal((await get("boss3")).statusCode, 404);
});

void test("a later acceptance gets its own bill on the same account", async () => {
  const first = await billOf(regIds.Liis);
  await prisma.registration.update({
    where: { id: regIds.Mari },
    data: { isRegistered: true },
  });

  assert.equal((await send("boss3", PARENT)).statusCode, 204);
  const second = await billOf(regIds.Mari);

  assert.equal(second.number, first.number + 1);
  assert.equal(second.accountId, first.accountId);
  assert.deepEqual(
    second.items.map((item) => item.childName),
    ["Mari"],
  );

  const html = (await mail.next()).html as string;
  assert.ok(
    html.includes(
      `<li>Liis (1. vahetus)</li><li>Peeter (2. vahetus)</li></ul><p>olid juba registreeritud (arve ${first.number}).</p>`,
    ),
  );
});

void test("an email without children in the sender's shifts is unknown", async () => {
  await addChild("Aino", 1, "other@test.invalid", true);
  const res = await send("boss3", "other@test.invalid");
  assert.equal(res.statusCode, 404);
  assert.ok("email" in res.json<FailBody>().data);
});

void test("a created bill is emailed by the next send instead of a new one", async () => {
  const created = await post("boss1", "/api/bills", "other@test.invalid");
  assert.equal(created.statusCode, 201);
  const { billNr } = created.json<{ data: { billNr: number } }>().data;
  assert.equal((await billOf(regIds.Aino)).sentAt, null);
  const sentBefore = mail.sent.length;

  assert.equal((await send("boss1", "other@test.invalid")).statusCode, 204);
  assert.equal(mail.sent.length, sentBefore + 1);
  const bill = await billOf(regIds.Aino);
  assert.equal(bill.number, billNr);
  assert.notEqual(bill.sentAt, null);
  await mail.next();
});

void test("simultaneous sends issue and email one bill", async () => {
  const email = "busy@test.invalid";
  await addChild("Karl", 1, email, true);
  await addChild("Kati", 2, email, true);
  const sentBefore = mail.sent.length;

  const results = await Promise.all([
    send("boss1", email),
    send("boss2", email),
  ]);
  assert.equal(results.filter((res) => res.statusCode === 204).length, 1);
  assert.equal(await prisma.bill.count({ where: { payerEmail: email } }), 1);
  assert.equal(mail.sent.length, sentBefore + 1);
  await mail.next();
});

const fetchRegistration = async (shiftNr: number, regId: number) => {
  const res = await app.inject({
    method: "GET",
    url: `/api/registrations?shiftNr=${shiftNr}`,
    headers: { cookie: cookies[`boss${shiftNr}`] },
  });
  type Registration = { id: number; bill: BillSummary | null };
  const registration = res
    .json<{ data: { registrations: Registration[] } }>()
    .data.registrations.find((r) => r.id === regId);
  assert.ok(registration);
  return registration;
};

void test("the billing overview shows each child's bill", async () => {
  const bill = await billOf(regIds.Liis);
  const res = await app.inject({
    method: "GET",
    url: "/api/shifts/1/billing",
    headers: { cookie: cookies.boss1 },
  });
  assert.equal(res.statusCode, 200);

  type Parent = {
    email: string;
    records: { childName: string; bill: BillSummary | null }[];
  };
  const parent = res
    .json<{ data: { records: Parent[] } }>()
    .data.records.find((p) => p.email === PARENT);
  assert.ok(parent);
  assert.deepEqual(
    parent.records.map((r) => [r.childName, r.bill?.number, r.bill?.status]),
    [
      ["Liis", bill.number, "open"],
      ["Peeter", bill.number, "open"],
    ],
  );
});

void test("registrations carry their bill and its status", async () => {
  const bill = await billOf(regIds.Liis);
  const registration = await fetchRegistration(1, regIds.Liis);
  assert.deepEqual(registration.bill, {
    number: bill.number,
    sent: true,
    status: "open",
    paidCents: 0,
    totalCents: (computePrice(1, false) + computePrice(2, false)) * 100,
    paymentsUpdatedAt: null,
  });
  assert.equal((await fetchRegistration(1, regIds.Karl)).bill?.sent, true);
});

const pick = (registration: { bill: BillSummary | null }) => [
  registration.bill?.status,
  registration.bill?.paidCents,
];

const recordPayment = (reference: string, amountCents: number) =>
  app.inject({
    method: "POST",
    url: "/api/payments",
    headers: { cookie: cookies.owner },
    payload: { reference, amountCents },
  });

void test("recorded payments count toward the parent's bill", async () => {
  const bill = await billOf(regIds.Aino);
  const total = computePrice(1, false) * 100;
  const bookingFee = REGISTRATION_FEE * 100;

  // Spaces in the reference are ignored.
  const res = await recordPayment(
    bill.account.reference.replace(/(\d{3})/, "$1 "),
    bookingFee,
  );
  assert.equal(res.statusCode, 201);
  const afterBookingFee = await fetchRegistration(1, regIds.Aino);
  assert.deepEqual(pick(afterBookingFee), ["open", bookingFee]);
  const updatedAt = afterBookingFee.bill?.paymentsUpdatedAt;
  assert.ok(updatedAt && !Number.isNaN(Date.parse(updatedAt)));

  await recordPayment(bill.account.reference, total - bookingFee);
  assert.deepEqual(pick(await fetchRegistration(1, regIds.Aino)), [
    "paid",
    total,
  ]);

  // A negative payment undoes one.
  await recordPayment(bill.account.reference, -(total - bookingFee));
  assert.deepEqual(pick(await fetchRegistration(1, regIds.Aino)), [
    "open",
    bookingFee,
  ]);
});

void test("a payment with an unknown reference is rejected", async () => {
  const res = await recordPayment("111111", 1000);
  assert.equal(res.statusCode, 404);
  assert.ok("reference" in res.json<{ data: object }>().data);
});

void test("a missed booking-fee deadline shows the bill as overdue", async () => {
  const bill = await billOf(regIds.Mari);
  await prisma.bill.update({
    where: { id: bill.id },
    data: { bookingFeeDue: new Date("2020-01-04T00:00:00.000Z") },
  });
  assert.equal(
    (await fetchRegistration(3, regIds.Mari)).bill?.status,
    "booking-fee-overdue",
  );
});
