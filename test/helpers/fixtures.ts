import "./test-env";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";

import {
  Prisma,
  type Child,
  type Registration,
  type ShiftInfo,
  type User,
} from "#app/generated/prisma/client";
import type { RoleName } from "#app/constants/roles";
import prisma from "#app/lib/prisma";

export const TEST_PASSWORD = "test-password-123";

// Cost 4 keeps the suite fast; bcrypt.compare does not care about the cost.
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

const daysFromNowUTCMidnight = (days: number): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  );
};

// ShiftInfo row. id defaults to shiftNr; startDate to 90 days out at UTC
// midnight. Any field is overridable.
export const createShiftInfo = (
  shiftNr: number,
  overrides?: Partial<Prisma.ShiftInfoUncheckedCreateInput>,
): Promise<ShiftInfo> =>
  prisma.shiftInfo.create({
    data: {
      id: shiftNr,
      bossName: "Boss",
      bossEmail: `boss${shiftNr}@test.invalid`,
      bossPhone: "5550000",
      length: 12,
      startDate: daysFromNowUTCMidnight(90),
      ...overrides,
    },
  });

// User + optional per-shift roles. Password is always TEST_PASSWORD hashed at
// cost 4. `roles` looks up each Role by name and creates UserRoles rows.
// `superRoot` sets User.role = "root". email defaults to
// `${username}@test.invalid` (pass null explicitly for no email); currentShift
// defaults to the first role's shiftNr, or 1.
export const createUser = async (opts: {
  username: string;
  roles?: { shiftNr: number; roleName: RoleName }[];
  superRoot?: boolean;
  email?: string | null;
  currentShift?: number;
}): Promise<User> => {
  const roles = opts.roles ?? [];
  const currentShift = opts.currentShift ?? roles[0]?.shiftNr ?? 1;
  const email =
    opts.email === undefined ? `${opts.username}@test.invalid` : opts.email;

  const user = await prisma.user.create({
    data: {
      username: opts.username,
      name: opts.username,
      email,
      currentShift,
      password: passwordHash,
      role: opts.superRoot ? "root" : "std",
    },
  });

  for (const { shiftNr, roleName } of roles) {
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName } });
    await prisma.userRoles.create({
      data: { userId: user.id, shiftNr, roleId: role.id },
    });
  }

  return user;
};

// Maintains a module-level counter that feeds regOrder and the default
// contactEmail so sequential fixtures stay disjoint.
let regCounter = 0;

// Child + Registration. Registration defaults are all overridable via
// `overrides`; the child is always sex "M" with birthYear derived from the
// registration birthday.
export const createChildWithRegistration = async (opts: {
  name: string;
  shiftNr: number;
  overrides?: Partial<Prisma.RegistrationUncheckedCreateInput>;
}): Promise<{ child: Child; registration: Registration }> => {
  const counter = ++regCounter;
  const overrides = opts.overrides ?? {};

  const birthday = overrides.birthday
    ? new Date(overrides.birthday)
    : new Date(Date.UTC(2014, 4, 5));

  const child = await prisma.child.create({
    data: {
      name: opts.name,
      sex: "M",
      birthYear: birthday.getUTCFullYear(),
    },
  });

  const registration = await prisma.registration.create({
    data: {
      childId: child.id,
      shiftNr: opts.shiftNr,
      regId: randomUUID(),
      regOrder: counter,
      birthday,
      tsSize: "M",
      road: "x",
      city: "x",
      county: "x",
      country: "Eesti",
      contactName: "Parent",
      contactNumber: "5551234",
      contactEmail: `parent${counter}@test.invalid`,
      isRegistered: false,
      isOld: true,
      priceToPay: 250,
      ...overrides,
    },
  });

  return { child, registration };
};

// Logs in via POST /api/auth/login and returns the cookie header value
// ("sessionId=..."), ready for inject({ headers: { cookie } }). Asserts the
// login itself returned 200.
export const loginAs = async (
  app: FastifyInstance,
  username: string,
): Promise<string> => {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: TEST_PASSWORD },
  });
  assert.equal(
    res.statusCode,
    200,
    `loginAs(${username}) expected 200 but got ${res.statusCode}: ${res.body}`,
  );

  const cookie = res.cookies.find((c) => c.name === "sessionId");
  if (!cookie) {
    throw new Error(`loginAs(${username}) did not set a sessionId cookie`);
  }
  return `${cookie.name}=${cookie.value}`;
};
