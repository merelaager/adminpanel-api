import bcrypt from "bcrypt";
import type { FastifyBaseLogger } from "fastify";
import { Prisma, type User } from "#app/generated/prisma/client";

import prisma from "#app/lib/prisma";
import { deleteUserSessions } from "#app/lib/session";
import { validatePasswordPolicy } from "#app/lib/password";
import { SALT_ROUNDS, TOKEN_EXPIRY_HOURS } from "#app/constants/auth";
import { Permissions } from "#app/constants/permissions";

import type { UserInfo } from "#app/routes/api/users/users.schemas";
import type { SignupBody } from "./auth.schemas";

export const formatUserInfo = async (user: User): Promise<UserInfo> => {
  const shifts = await prisma.userRoles.findMany({
    where: { userId: user.id },
    select: {
      role: {
        select: {
          roleName: true,
          role_permissions: {
            where: {
              permission: { permissionName: Permissions.VIEW_SHIFT_BASIC },
            },
            select: { roleId: true },
          },
        },
      },
      shiftNr: true,
    },
  });

  const managedShifts: number[] = [];

  let currentRole = "";

  shifts.forEach((shift) => {
    if (shift.role.role_permissions.length > 0) {
      managedShifts.push(shift.shiftNr);
    }
    if (shift.shiftNr === user.currentShift) currentRole = shift.role.roleName;
  });

  return {
    userId: user.id,
    name: user.name,
    nickname: user.nickname,
    email: user.email,
    currentShift: user.currentShift,
    currentRole,
    isRoot: user.role === "root",
    managedShifts,
  };
};

export const getUserInfo = async (
  userId: number,
): Promise<UserInfo | null> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return formatUserInfo(user);
};

export const authenticateUser = async (
  username: string,
  password: string,
): Promise<User | null> => {
  const user = await prisma.user.findUnique({
    where: {
      username: username.trim().toLowerCase(),
    },
  });

  const checkPassword = user
    ? user.password
    : "$2b$10$nOUIs5kJ7naTuTFkBy1veuK0kSxUFXfuaOKdOKf9xYT0KKIGSJwFa"; // Example value from the documentation
  const isValid = await bcrypt.compare(password, checkPassword);

  if (!isValid || !user) {
    return null;
  }

  return user;
};

export type SetPasswordResult =
  | { status: "wrong-password" }
  | { status: "weak-password"; reason: string }
  | { status: "ok" };

export const setPassword = async (
  userId: number,
  currentPassword: string,
  password: string,
  sessionId: string,
): Promise<SetPasswordResult> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return { status: "wrong-password" };
  }

  const rejectReason = validatePasswordPolicy(password);
  if (rejectReason) {
    return { status: "weak-password", reason: rejectReason };
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      password: passwordHash,
    },
  });

  await deleteUserSessions(userId, sessionId);

  return { status: "ok" };
};

export type SignupResult =
  | { status: "invalid-token" }
  | { status: "weak-password"; reason: string }
  | { status: "expired-token" }
  | { status: "conflict" }
  | { status: "error" }
  | { status: "created" };

export const signupUser = async (
  body: SignupBody,
  log: FastifyBaseLogger,
): Promise<SignupResult> => {
  const { token, username, password } = body;

  const signupData = await prisma.signupToken.findUnique({
    where: { token, isExpired: false },
  });

  if (!signupData) {
    return { status: "invalid-token" };
  }

  const rejectReason = validatePasswordPolicy(password);
  if (rejectReason) {
    return { status: "weak-password", reason: rejectReason };
  }

  const now = new Date();

  const diffMs = Math.abs(now.getTime() - signupData.createdAt.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours > TOKEN_EXPIRY_HOURS) {
    await prisma.signupToken.update({
      where: { token },
      data: { isExpired: true },
    });
    return { status: "expired-token" };
  }

  const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: username.trim(),
          currentShift: signupData.shiftNr,
          name: body.name.trim(),
          email: signupData.email,
          nickname: body.nickname || body.name.split(" ")[0],
          password: passwordHash,
        },
      });
      // Consume the token.
      await tx.signupToken.update({
        where: { token },
        data: { isExpired: true, usedDate: new Date() },
      });
      // Assign permissions
      if (signupData.roleId) {
        await tx.userRoles.create({
          data: {
            shiftNr: signupData.shiftNr,
            userId: user.id,
            roleId: signupData.roleId,
          },
        });
      }
    });
  } catch (err) {
    log.error({ err }, "Failed to create user during signup");
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return { status: "conflict" };
      }
    }

    return { status: "error" };
  }

  return { status: "created" };
};
