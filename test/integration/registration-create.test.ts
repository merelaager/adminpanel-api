import "../helpers/test-env";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import { createShiftInfo } from "../helpers/fixtures";
import { computePrice } from "#app/routes/api/registrations/create.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOB = new Date(Date.UTC(2015, 0, 2)).toISOString();

let app: FastifyInstance;

const baseEntry = {
  name: "Test Child",
  shiftNr: 1,
  isNew: true,
  shirtSize: "M",
  road: "Road 1",
  city: "City",
  county: "County",
  country: "Eesti",
  contactName: "Parent",
  contactEmail: "creator@test.invalid",
  contactNumber: "5551111",
};

const entry = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  ...baseEntry,
  ...overrides,
});

const post = (payload: unknown[]) =>
  app.inject({ method: "POST", url: "/api/registrations", payload });

interface CreateResponse {
  status: string;
  data: { registrationId?: string } & Record<string, unknown>;
}

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createShiftInfo(2);
  app = await build();
});

after(async () => {
  await app.close();
});

void test("creates a registration from a valid ID code", async () => {
  const idCode = "51501020003"; // male, 2015-01-02
  const res = await post([entry({ name: "Idcode Kid", idCode })]);
  assert.equal(res.statusCode, 201);

  const body = res.json<CreateResponse>();
  assert.equal(body.status, "success");
  assert.match(body.data.registrationId ?? "", UUID_RE);

  const child = await prisma.child.findUniqueOrThrow({ where: { idCode } });
  assert.equal(child.sex, "M");
  assert.equal(child.birthYear, 2015);

  const reg = await prisma.registration.findFirstOrThrow({
    where: { regId: body.data.registrationId },
  });
  // isNew: true -> isOld: false.
  assert.equal(reg.priceToPay, computePrice(1, false));
});

void test("creates a registration from explicit sex and dob", async () => {
  const res = await post([entry({ name: "Sexdob Kid", sex: "F", dob: DOB })]);
  assert.equal(res.statusCode, 201);
});

void test("an invalid ID code is a 400 and rolls the transaction back", async () => {
  const before = await prisma.child.count();
  const res = await post([
    entry({ name: "Rollback Kid", idCode: "51513020003" }), // month 13
  ]);
  assert.equal(res.statusCode, 400);

  const body = res.json<CreateResponse>();
  assert.equal(body.status, "fail");
  assert.ok("[0].idCode" in body.data);

  const after = await prisma.child.count();
  assert.equal(after, before, "no child row was created");
});

void test("missing sex+dob without an ID code is a 400", async () => {
  const res = await post([entry({ name: "Nodata Kid" })]);
  assert.equal(res.statusCode, 400);

  const body = res.json<CreateResponse>();
  assert.equal(body.status, "fail");
  assert.ok("[0].sex" in body.data);
  assert.ok("[0].dob" in body.data);
});

void test("a duplicate child for the same shift is hidden, not leaked", async () => {
  const idCode = "51306150007"; // 2013-06-15
  const first = await post([entry({ name: "Dupe Kid", idCode })]);
  assert.equal(first.statusCode, 201);
  const second = await post([entry({ name: "Dupe Kid", idCode })]);
  assert.equal(second.statusCode, 201);

  const regs = await prisma.registration.findMany({
    where: { idCode },
    orderBy: { id: "asc" },
  });
  assert.equal(regs.length, 2);
  assert.equal(regs[0].visible, true);
  assert.equal(regs[1].visible, false);
});

void test("more than four entries is rejected by the schema", async () => {
  const payload = Array.from({ length: 5 }, (_, i) =>
    entry({ name: `Bulk ${i}`, sex: "M", dob: DOB }),
  );
  const res = await post(payload);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json<CreateResponse>().status, "fail");
});

void test("sequential registrations get strictly increasing regOrder", async () => {
  const r1 = await post([entry({ name: "Order A", sex: "M", dob: DOB })]);
  const r2 = await post([entry({ name: "Order B", sex: "M", dob: DOB })]);
  assert.equal(r1.statusCode, 201);
  assert.equal(r2.statusCode, 201);

  const id1 = r1.json<CreateResponse>().data.registrationId;
  const id2 = r2.json<CreateResponse>().data.registrationId;

  const reg1 = await prisma.registration.findFirstOrThrow({
    where: { regId: id1 },
  });
  const reg2 = await prisma.registration.findFirstOrThrow({
    where: { regId: id2 },
  });
  assert.ok(reg2.regOrder > reg1.regOrder);
});
