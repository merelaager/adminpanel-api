import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import {
  TEST_PASSWORD,
  createShiftInfo,
  createUser,
} from "../helpers/fixtures";

let app: FastifyInstance;
let userId = 0;

const login = (password: string) =>
  app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "legacy", password },
  });

const storedHash = async () =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).password;

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  const user = await createUser({ username: "legacy" });
  userId = user.id;
  await prisma.user.update({
    where: { id: userId },
    data: { password: bcrypt.hashSync(TEST_PASSWORD, 4) },
  });
  app = await build();
});

after(async () => {
  await app.close();
});

void test("a wrong password leaves a bcrypt hash untouched", async () => {
  const before = await storedHash();
  const res = await login("wrong-password");
  assert.equal(res.statusCode, 401);
  assert.equal(await storedHash(), before);
});

void test("a successful login with a bcrypt hash replaces it with argon2id", async () => {
  const res = await login(TEST_PASSWORD);
  assert.equal(res.statusCode, 200);
  assert.match(await storedHash(), /^\$argon2id\$/);
});

void test("the user can log in again with the rehashed password", async () => {
  const res = await login(TEST_PASSWORD);
  assert.equal(res.statusCode, 200);
});
