import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import "../helpers/test-env";

import { getCurrentCampYear } from "#app/lib/camp-year";
import { computePrice } from "#app/routes/api/registrations/create.service";
import type { PayerAccountData } from "#app/routes/api/payments/payments.schemas";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import { captureMail } from "../helpers/mail";
import {
  createShiftInfo,
  createUser,
  createChildWithRegistration,
  loginAs,
} from "../helpers/fixtures";

let app: FastifyInstance;
const cookies: Record<string, string> = {};
let list: { accounts: PayerAccountData[] };

const ANU = "anu@test.invalid";
const BERT = "bert@test.invalid";

const addChild = async (
  name: string,
  shiftNr: number,
  email: string,
  contactName: string,
) => {
  const { registration } = await createChildWithRegistration({
    name,
    shiftNr,
    overrides: {
      contactEmail: email,
      contactName,
      isRegistered: true,
      isOld: false,
      priceToPay: computePrice(shiftNr, false),
    },
  });
  return registration.id;
};

const request = (
  as: string,
  method: "GET" | "POST",
  url: string,
  payload?: object,
) => app.inject({ method, url, headers: { cookie: cookies[as] }, payload });

const sendBill = async (as: string, email: string): Promise<number> => {
  const res = await request(as, "POST", "/api/bills/send", { email });
  assert.equal(res.statusCode, 200);
  return res.json<{ data: { billNrs: number[] } }>().data.billNrs[0];
};

const pay = async (email: string, amountCents: number) => {
  const { reference } = await prisma.payerAccount.findFirstOrThrow({
    where: { email },
  });
  const res = await request("owner", "POST", "/api/payments", {
    reference,
    amountCents,
  });
  assert.equal(res.statusCode, 201);
};

const totalsOf = async (number: number) => {
  const { items } = await prisma.bill.findUniqueOrThrow({
    where: { number },
    include: { items: true },
  });
  return {
    total: items.reduce((sum, item) => sum + item.amount, 0),
    bookingFee: items.reduce((sum, item) => sum + item.bookingFee, 0),
  };
};

const bills: Record<string, number> = {};

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createShiftInfo(2);
  await createUser({
    username: "boss1",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  await createUser({
    username: "boss2",
    roles: [{ shiftNr: 2, roleName: "boss" }],
  });
  await createUser({
    username: "owner",
    roles: [{ shiftNr: 1, roleName: "root" }],
  });

  app = await build();
  captureMail(app);
  for (const username of ["boss1", "boss2", "owner"]) {
    cookies[username] = await loginAs(app, username);
  }

  // Anu: one bill per shift, paid in full for the first and the booking fee of the second.
  await addChild("Mati", 1, ANU, "Anu Tamm");
  bills.anuFirst = await sendBill("boss1", ANU);
  await addChild("Kati", 2, ANU, "Anu Tamm");
  bills.anuSecond = await sendBill("boss2", ANU);
  const first = await totalsOf(bills.anuFirst);
  const second = await totalsOf(bills.anuSecond);
  await pay(ANU, first.total + second.bookingFee);

  // Bert: a bill reissued at a lower price, then overpaid.
  const bertChild = await addChild("Toomas", 2, BERT, "Bert Kask");
  bills.bertVoid = await sendBill("boss2", BERT);
  await prisma.registration.update({
    where: { id: bertChild },
    data: { priceToPay: computePrice(2, false) - 50 },
  });
  const reissued = await request(
    "owner",
    "POST",
    `/api/bills/${bills.bertVoid}/reissue`,
  );
  assert.equal(reissued.statusCode, 201);
  bills.bertReplacement = reissued.json<{
    data: { billNr: number };
  }>().data.billNr;
  await pay(BERT, (await totalsOf(bills.bertReplacement)).total + 500);

  // An account from last season.
  await prisma.payerAccount.create({
    data: {
      season: getCurrentCampYear() - 1,
      email: "aadu@test.invalid",
      contactName: "Aadu Vana",
      reference: "250017",
    },
  });

  const res = await request("owner", "GET", "/api/payments/accounts");
  assert.equal(res.statusCode, 200);
  list = res.json<{ data: typeof list }>().data;
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

const accountOf = (email: string) => {
  const account = list.accounts.find((a) => a.email === email);
  assert.ok(account);
  return account;
};

void test("only the owner sees the payer accounts", async () => {
  const res = await request("boss1", "GET", "/api/payments/accounts");
  assert.equal(res.statusCode, 403);
});

void test("the list has this season's accounts from all shifts, by name", () => {
  assert.deepEqual(
    list.accounts.map((a) => a.name),
    ["Anu Tamm", "Bert Kask"],
  );
});

void test("payments fill the bills by due date", async () => {
  const first = await totalsOf(bills.anuFirst);
  const second = await totalsOf(bills.anuSecond);
  const account = accountOf(ANU);

  assert.equal(account.billedCents, first.total + second.total);
  assert.equal(account.paidCents, first.total + second.bookingFee);
  assert.deepEqual(
    account.bills.map((b) => [
      b.number,
      b.status,
      b.sent,
      b.paidCents,
      b.totalCents,
      b.shiftNrs,
    ]),
    [
      [bills.anuFirst, "paid", true, first.total, first.total, [1]],
      [bills.anuSecond, "open", true, second.bookingFee, second.total, [2]],
    ],
  );
  assert.deepEqual(
    account.payments.map((p) => p.amountCents),
    [first.total + second.bookingFee],
  );
});

void test("a void bill is listed but not billed, and an overpayment shows", async () => {
  const replacement = await totalsOf(bills.bertReplacement);
  const account = accountOf(BERT);

  assert.equal(account.billedCents, replacement.total);
  assert.equal(account.paidCents, replacement.total + 500);
  assert.deepEqual(
    account.bills.map((b) => [b.number, b.status, b.paidCents]),
    [
      [bills.bertVoid, "void", 0],
      [bills.bertReplacement, "paid", replacement.total],
    ],
  );
});

void test("each account says when a payment was last added to it", async () => {
  for (const email of [ANU, BERT]) {
    const { _max } = await prisma.payment.aggregate({
      where: { account: { email } },
      _max: { createdAt: true },
    });
    assert.equal(
      accountOf(email).paymentsUpdatedAt,
      _max.createdAt?.toISOString(),
    );
  }
});
