import bcrypt from "bcrypt";
import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "#app/utils/prisma";
import { deleteUserSessions, getSessionUser } from "#app/utils/session";
import type { User } from "#app/generated/prisma/client";

import type { ChangePasswordBody, LoginBody } from "#app/schemas/auth";
import type { UserInfo } from "#app/schemas/user";
import type { JSendResponse } from "#app/schemas/jsend";
import { UnknownData } from "#app/schemas/jsend";
import { createFailResponse } from "#app/utils/jsend";
import { validatePasswordPolicy } from "./users.controller";
import { Permissions } from "#app/constants/permissions";

interface IUserInfoHandler extends RouteGenericInterface {
  Reply: JSendResponse<typeof UnknownData, typeof UnknownData> | null;
}

export const userInfoHandler = async (
  req: FastifyRequest<IUserInfoHandler>,
  res: FastifyReply<IUserInfoHandler>,
): Promise<never> => {
  const { userId } = getSessionUser(req);

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res.status(StatusCodes.FORBIDDEN).send(null);
  }

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: await formatUserInfo(user),
  });
};

interface ILoginHandler extends RouteGenericInterface {
  Body: LoginBody;
  Reply: JSendResponse<typeof UnknownData, typeof UnknownData>;
}

export const loginHandler = async (
  req: FastifyRequest<ILoginHandler>,
  res: FastifyReply<ILoginHandler>,
) => {
  const { username, password } = req.body;

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
    return res.code(StatusCodes.UNAUTHORIZED).send({
      status: "fail",
      data: { message: "Vale kasutajanimi või parool." },
    });
  }

  await req.session.regenerate();
  req.session.user = { userId: user.id };
  await req.session.save();

  return res.code(StatusCodes.OK).send({
    status: "success",
    data: await formatUserInfo(user),
  });
};

interface ISetPasswordHandler extends RouteGenericInterface {
  Body: ChangePasswordBody;
  Reply: JSendResponse<typeof UnknownData, typeof UnknownData> | null;
}

export const setPasswordHandler = async (
  req: FastifyRequest<ISetPasswordHandler>,
  res: FastifyReply<ISetPasswordHandler>,
) => {
  const { userId } = getSessionUser(req);
  const { currentPassword, password } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .send(createFailResponse({ currentPassword: "Vale salasõna." }));
  }

  const rejectReason = validatePasswordPolicy(password);
  if (rejectReason) {
    return res
      .status(StatusCodes.UNPROCESSABLE_ENTITY)
      .send(createFailResponse({ password: rejectReason }));
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await prisma.user.update({
    where: { id: userId },
    data: {
      password: passwordHash,
    },
  });

  await deleteUserSessions(userId, req.session.sessionId);

  return res.status(StatusCodes.NO_CONTENT).send(null);
};

const formatUserInfo = async (user: User): Promise<UserInfo> => {
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
