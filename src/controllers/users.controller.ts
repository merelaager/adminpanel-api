import { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { Prisma } from "#app/generated/prisma/client";

import {
  SALT_ROUNDS,
  TOKEN_EXPIRY_HOURS,
  TOKEN_EXPIRY_MS,
} from "#app/constants/auth";
import prisma from "#app/lib/prisma";
import { deleteUserSessions } from "#app/lib/session";
import MailService from "#app/services/mail.service";

import { ResetPasswordSchema, SignupSchema } from "#app/schemas/user";
import type { JSendError, JSendResponse } from "#app/lib/jsend";
import { UnknownData } from "#app/lib/jsend";
import { createFailResponse } from "#app/lib/jsend";
import type { Route } from "#app/schemas/route";

export const validatePasswordPolicy = (password: string): string | null => {
  if (password.length < 8) return "Salasõna on liiga lühike.";
  return null;
};

type IRequestPasswordResetHandler = Route<{
  body: typeof ResetPasswordSchema;
}> & { Reply: null };

export const resetPasswordHandler = async (
  req: FastifyRequest<IRequestPasswordResetHandler>,
  res: FastifyReply<IRequestPasswordResetHandler>,
) => {
  if ("email" in req.body) {
    const email = req.body.email;
    const userData = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (userData === null) {
      return res.status(StatusCodes.ACCEPTED).send();
    }

    const token = uuidv4();
    await prisma.resetToken.create({
      data: { token, userId: userData.id },
    });

    const mailService = new MailService(
      req.server.mailer,
      req.server.config.APP_URL,
    );
    try {
      await mailService.sendPasswordResetToken(email, token);
    } catch (err) {
      req.log.error({ err, email }, "Failed to send password reset email");
    }

    return res.status(StatusCodes.ACCEPTED).send();
  }

  const { token, password } = req.body;
  const tokenEntry = await prisma.resetToken.findUnique({
    where: { token },
  });
  if (!tokenEntry) {
    return res.status(StatusCodes.FORBIDDEN).send();
  }

  const rejectReason = validatePasswordPolicy(password);
  if (rejectReason) {
    return res
      .status(StatusCodes.UNPROCESSABLE_ENTITY)
      .send(createFailResponse({ password: rejectReason }));
  }

  const isOlderThan24h =
    Date.now() - new Date(tokenEntry.createdAt).getTime() > TOKEN_EXPIRY_MS;
  if (isOlderThan24h) {
    await prisma.resetToken.delete({ where: { token } });
    return res.status(StatusCodes.FORBIDDEN).send();
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: tokenEntry.userId },
    data: { password: passwordHash },
  });

  await deleteUserSessions(tokenEntry.userId);
  await prisma.resetToken.deleteMany({ where: { userId: tokenEntry.userId } });

  return res.status(StatusCodes.NO_CONTENT).send(null);
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
