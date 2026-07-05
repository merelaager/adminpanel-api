import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import { TEST_PASSWORD, createShiftInfo, createUser } from "../helpers/fixtures";

interface JsendResponse {
  status: string;
  data: Record<string, unknown>;
}

let app: FastifyInstance;
let bossCookie: string;
let helperCookie: string;

before(async () => {
  await resetDb();
  await createShiftInfo(1);
  await createUser({
    username: "boss1",
    roles: [{ shiftNr: 1, roleName: "boss" }],
  });
  await createUser({
    username: "helper1",
    roles: [{ shiftNr: 1, roleName: "helper" }],
  });
  app = await build();

  bossCookie = await login("boss1");
  helperCookie = await login("helper1");
});

after(async () => {
  await app.close();
});

const login = async (username: string): Promise<string> => {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: TEST_PASSWORD },
  });
  assert.equal(res.statusCode, 200);
  const cookie = res.cookies.find((c) => c.name === "sessionId");
  assert.ok(cookie);
  return `${cookie.name}=${cookie.value}`;
};

void test("invite: boss creates a signup token and staff row", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/users/invites",
    headers: { cookie: bossCookie },
    payload: {
      email: "new@test.invalid",
      name: "New Person",
      shiftNr: 1,
      role: "instructor",
    },
  });
  assert.equal(res.statusCode, 204);

  const token = await prisma.signupToken.findFirst({
    where: { email: "new@test.invalid" },
  });
  assert.ok(token, "a signup token row exists for the invited email");
  assert.ok(token.roleId, "the token carries a roleId");

  const staff = await prisma.shiftStaff.findFirst({
    where: { name: "New Person", shiftNr: 1 },
  });
  assert.ok(staff, "a shift_staff row exists for the invited person");
  assert.equal(staff.role, "full");
});

void test("invite: an unknown role value is rejected", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/users/invites",
    headers: { cookie: bossCookie },
    payload: {
      email: "other@test.invalid",
      name: "Other Person",
      shiftNr: 1,
      role: "sultan",
    },
  });
  assert.equal(res.statusCode, 422);
  const body = res.json<JsendResponse>();
  assert.equal(body.status, "fail");
  assert.ok(body.data.role);
});

void test("signup: consumes the token, creates the user and role", async () => {
  const token = await prisma.signupToken.findFirstOrThrow({
    where: { email: "new@test.invalid" },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: {
      username: "newbie",
      email: "new@test.invalid",
      name: "New Person",
      password: "longenough1",
      token: token.token,
    },
  });
  assert.equal(res.statusCode, 201);

  // The new user can log in.
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "newbie", password: "longenough1" },
  });
  assert.equal(login.statusCode, 200);

  const user = await prisma.user.findUniqueOrThrow({
    where: { username: "newbie" },
  });
  const userRole = await prisma.userRoles.findFirst({
    where: { userId: user.id, shiftNr: 1 },
    include: { role: true },
  });
  assert.ok(userRole);
  assert.equal(userRole.role.roleName, "instructor");

  const consumed = await prisma.signupToken.findUniqueOrThrow({
    where: { token: token.token },
  });
  assert.equal(consumed.isExpired, true);
  assert.ok(consumed.usedDate);
});

void test("signup: a consumed token cannot be reused", async () => {
  const token = await prisma.signupToken.findFirstOrThrow({
    where: { email: "new@test.invalid" },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: {
      username: "newbie2",
      email: "new@test.invalid",
      name: "New Person",
      password: "longenough1",
      token: token.token,
    },
  });
  assert.equal(res.statusCode, 403);
  assert.ok(res.json<JsendResponse>().data.token);
});

void test("signup: an expired token is rejected and marked expired", async () => {
  const role = await prisma.role.findUniqueOrThrow({
    where: { roleName: "instructor" },
  });
  const created = await prisma.signupToken.create({
    data: {
      token: crypto.randomUUID(),
      email: "expired@test.invalid",
      shiftNr: 1,
      roleId: role.id,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: {
      username: "expiredsignup",
      email: "expired@test.invalid",
      name: "Expired Person",
      password: "longenough1",
      token: created.token,
    },
  });
  assert.equal(res.statusCode, 403);
  assert.ok(res.json<JsendResponse>().data.token);

  const after = await prisma.signupToken.findUniqueOrThrow({
    where: { token: created.token },
  });
  assert.equal(after.isExpired, true);
});

void test("signup: a weak password is rejected before the token is consumed", async () => {
  const role = await prisma.role.findUniqueOrThrow({
    where: { roleName: "instructor" },
  });
  const created = await prisma.signupToken.create({
    data: {
      token: crypto.randomUUID(),
      email: "weak@test.invalid",
      shiftNr: 1,
      roleId: role.id,
    },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: {
      username: "weakling",
      email: "weak@test.invalid",
      name: "Weak Person",
      password: "1234567",
      token: created.token,
    },
  });
  assert.equal(res.statusCode, 422);
  assert.ok(res.json<JsendResponse>().data.password);

  const untouched = await prisma.signupToken.findUniqueOrThrow({
    where: { token: created.token },
  });
  assert.equal(untouched.isExpired, false);
});

void test("signup: a duplicate username is a conflict", async () => {
  const role = await prisma.role.findUniqueOrThrow({
    where: { roleName: "instructor" },
  });
  const created = await prisma.signupToken.create({
    data: {
      token: crypto.randomUUID(),
      email: "dupe@test.invalid",
      shiftNr: 1,
      roleId: role.id,
    },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: {
      username: "boss1",
      email: "dupe@test.invalid",
      name: "Dupe Person",
      password: "longenough1",
      token: created.token,
    },
  });
  assert.equal(res.statusCode, 409);
  assert.ok(res.json<JsendResponse>().data.conflict);
});

void test("invite: a helper without EDIT_SHIFT_MEMBERS is forbidden", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/users/invites",
    headers: { cookie: helperCookie },
    payload: {
      email: "nope@test.invalid",
      name: "Nope Person",
      shiftNr: 1,
      role: "helper",
    },
  });
  assert.equal(res.statusCode, 403);
});
