import { ReadStream } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";

import { Credentials } from "../schemas/auth";
import type { JSendResponse } from "../types/jsend";

interface IUserInfoHandler extends RouteGenericInterface {
  Reply: JSendResponse | ReadStream;
}

export const userInfoHandler = async (
  req: FastifyRequest<IUserInfoHandler>,
  res: FastifyReply<IUserInfoHandler>,
) => {
  const { userId } = req.session.user;

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res.status(StatusCodes.FORBIDDEN).send();
  }

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: {
      userId,
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      currentShift: user.currentShift,
    },
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
