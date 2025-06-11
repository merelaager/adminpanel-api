import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";

import type { JSendResponse } from "../types/jsend";
import type { Credentials } from "../schemas/auth";
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

  const userInfo: UserInfo = {
    userId,
    name: user.name,
    nickname: user.nickname,
    email: user.email,
    currentShift: user.currentShift,
    isRoot: user.role === "root",
  };

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: userInfo,
  });
};

export const authenticateUser = async (
  { username, password }: Credentials,
  prisma: PrismaClient,
) => {
  const user = await prisma.user.findUnique({
    where: {
      username: username.trim().toLowerCase(),
    },
  });

  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;

  return user;
};
