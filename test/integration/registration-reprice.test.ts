import "../helpers/test-env";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { computePrice } from "#app/routes/api/registrations/create.service";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import {
  createShiftInfo,
  createUser,
  createChildWithRegistration,
  loginAs,
} from "../helpers/fixtures";

const SHIFT = 2;
const NEW_PRICE = computePrice(SHIFT, false);
const RETURNING_PRICE = computePrice(SHIFT, true);

let app: FastifyInstance;
let cookie = "";

before(async () => {
  await resetDb();
  await createShiftInfo(SHIFT);
  await createUser({
    username: "boss2",
    roles: [{ shiftNr: SHIFT, roleName: "boss" }],
  });

  app = await build();
  cookie = await loginAs(app, "boss2");
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

const createRegistration = async (isOld: boolean, priceToPay: number) => {
  const { registration } = await createChildWithRegistration({
    name: "Priced Camper",
    shiftNr: SHIFT,
    overrides: { isOld, priceToPay },
  });
  return registration.id;
};

const patch = async (regId: number, payload: object) => {
  const res = await app.inject({
    method: "PATCH",
    url: `/api/registrations/${regId}`,
    headers: { cookie },
    payload,
  });
  assert.equal(res.statusCode, 204);
};

const priceOf = async (regId: number) =>
  (await prisma.registration.findUniqueOrThrow({ where: { id: regId } }))
    .priceToPay;

void test("marking a new camper as returning moves them to the returning price", async () => {
  const regId = await createRegistration(false, NEW_PRICE);
  await patch(regId, { isOld: true });
  assert.equal(await priceOf(regId), RETURNING_PRICE);
});

void test("marking a returning camper as new moves them to the new price", async () => {
  const regId = await createRegistration(true, RETURNING_PRICE);
  await patch(regId, { isOld: false });
  assert.equal(await priceOf(regId), NEW_PRICE);
});

void test("a hand-set price is kept when isOld changes", async () => {
  const regId = await createRegistration(false, 123);
  await patch(regId, { isOld: true });
  assert.equal(await priceOf(regId), 123);
});

void test("an explicit priceToPay in the same patch wins", async () => {
  const regId = await createRegistration(false, NEW_PRICE);
  await patch(regId, { isOld: true, priceToPay: 200 });
  assert.equal(await priceOf(regId), 200);
});

void test("patching isOld to its current value keeps the price", async () => {
  const regId = await createRegistration(true, NEW_PRICE);
  await patch(regId, { isOld: true });
  assert.equal(await priceOf(regId), NEW_PRICE);
});
