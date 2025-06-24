import bcrypt from "bcrypt";
import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";
import type { User } from "@prisma/client";

import type { JSendResponse } from "../types/jsend";
import type { LoginBody } from "../schemas/auth";
import type { UserInfo } from "../schemas/user";

interface IUserInfoHandler extends RouteGenericInterface {
  Reply: JSendResponse;
}

export const userInfoHandler = async (
  req: FastifyRequest<IUserInfoHandler>,
  res: FastifyReply<IUserInfoHandler>,
): Promise<never> => {
  const { userId } = req.session.user;

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res.status(StatusCodes.FORBIDDEN).send();
  }

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: await formatUserInfo(user),
  });
};

interface ILoginHandler extends RouteGenericInterface {
  Body: LoginBody;
  Reply: JSendResponse;
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

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.code(StatusCodes.UNAUTHORIZED).send({
      status: "fail",
      data: { message: "Vale kasutajanimi või parool." },
    });
  }

  req.session.user = { userId: user.id };
  await req.session.save();

  return res.code(StatusCodes.OK).send({
    status: "success",
    data: await formatUserInfo(user),
  });
};

const formatUserInfo = async (user: User): Promise<UserInfo> => {
  const shifts = await prisma.userRoles.findMany({
    where: { userId: user.id },
    select: {
      role: { select: { roleName: true } },
      shiftNr: true,
    },
  });

  const managedShifts: number[] = [];
  const managedRoles = ["root", "boss", "instructor", "helper"];

  let currentRole = "";

  shifts.forEach((shift) => {
    if (managedRoles.includes(shift.role.roleName)) {
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
