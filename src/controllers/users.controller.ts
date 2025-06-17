import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { Static } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { isShiftMember } from "../utils/permissions";
import prisma from "../utils/prisma";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  type PatchUserBody,
  UserCreateSchema,
  type UserParams,
} from "../schemas/user";
import type { JSendResponse } from "../types/jsend";

export type UserCreateBasis = Static<typeof UserCreateSchema>;

export const getUsers = async (prisma: PrismaClient) => {
  return prisma.user.findMany();
};

export const createUser = async (
  userData: UserCreateBasis,
  prisma: PrismaClient,
) => {
  // TODO: find a TS-compatible way to include the role in the user creation.
  const userCreationData: Prisma.UserCreateArgs = {
    data: {
      username: userData.username,
      name: userData.name,
      email: userData.email,
      password: userData.password,
      nickname: userData.nickname,
      currentShift: userData.initialShift ?? 0,
    },
  };

  try {
    const createdUser = await prisma.user.create(userCreationData);
    return { success: true, data: createdUser };
  } catch (err: unknown) {
    console.error(err);

    let errorMessage = "Internal Server Error";
    let isUserError = false;

    // Email enumeration is partly mitigated by having
    // user creation be restricted to administrators.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        switch (err.meta?.target) {
          case "username":
            errorMessage = "Username already exists";
            isUserError = true;
            break;
          case "email":
            errorMessage = "Email already exists";
            isUserError = true;
            break;
        }
      }
    }

    return { success: false, userError: isUserError, error: errorMessage };
  }
};

interface IPatchUserHandler extends RouteGenericInterface {
  Params: UserParams;
  Body: PatchUserBody;
  Reply: JSendResponse | null;
}

export const patchUserHandler = async (
  req: FastifyRequest<IPatchUserHandler>,
  res: FastifyReply<IPatchUserHandler>,
): Promise<never> => {
  const { userId } = req.params;
  const requesterId = req.session.user.userId;

  if (userId !== requesterId) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { userId: "Muuta saab ainult enda kasutajat." },
    });
  }

  const currentShift = req.body.currentShift;
  if (currentShift !== undefined) {
    if (!(await isShiftMember(requesterId, currentShift))) {
      return res.status(StatusCodes.FORBIDDEN).send({
        status: "fail",
        data: {
          currentShift: `Kasutaja pole vahetuse liige. (shiftNr: ${currentShift})`,
        },
      });
    }

    await prisma.user.update({
      where: { id: requesterId },
      data: req.body,
    });
  }

  return res.status(StatusCodes.NO_CONTENT).send();
};
