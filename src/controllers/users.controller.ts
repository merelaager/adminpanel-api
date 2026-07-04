import { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import bcrypt from "bcrypt";
import { Prisma } from "#app/generated/prisma/client";

import { SALT_ROUNDS, TOKEN_EXPIRY_HOURS } from "#app/constants/auth";
import prisma from "#app/lib/prisma";

import { SignupSchema } from "#app/schemas/user";
import type { JSendError, JSendResponse } from "#app/lib/jsend";
import { UnknownData } from "#app/lib/jsend";
import { createFailResponse } from "#app/lib/jsend";
import type { Route } from "#app/schemas/route";

export const validatePasswordPolicy = (password: string): string | null => {
  if (password.length < 8) return "Salasõna on liiga lühike.";
  return null;
};

type ISignupUserHandler = Route<{ body: typeof SignupSchema }> & {
  Reply:
    | JSendResponse<typeof UnknownData, typeof UnknownData>
    | JSendError
    | null;
};

export const signupUserHandler = async (
  req: FastifyRequest<ISignupUserHandler>,
  res: FastifyReply<ISignupUserHandler>,
): Promise<never> => {
  const { token, username, password } = req.body;

  const signupData = await prisma.signupToken.findUnique({
    where: { token, isExpired: false },
  });

  if (!signupData) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { token: `Pääsmik ei kehti.` },
    });
  }

  const rejectReason = validatePasswordPolicy(password);
  if (rejectReason) {
    return res
      .status(StatusCodes.UNPROCESSABLE_ENTITY)
      .send(createFailResponse({ password: rejectReason }));
  }

  const now = new Date();

  const diffMs = Math.abs(now.getTime() - signupData.createdAt.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours > TOKEN_EXPIRY_HOURS) {
    await prisma.signupToken.update({
      where: { token },
      data: { isExpired: true },
    });
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { token: `Pääsmik on aegunud.` },
    });
  }

  const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: username.trim(),
          currentShift: signupData.shiftNr,
          name: req.body.name.trim(),
          email: signupData.email,
          nickname: req.body.nickname || req.body.name.split(" ")[0],
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
    req.log.error({ err }, "Failed to create user during signup");
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return res.status(StatusCodes.CONFLICT).send({
          status: "fail",
          data: {
            conflict: "Kasutajanimi on juba kasutuses.",
          },
        });
      }
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Serveri viga kasutaja loomisel.",
    });
  }

  return res.status(StatusCodes.CREATED).send(null);
};
