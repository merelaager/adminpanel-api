import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { Static } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { Prisma, type PrismaClient } from "#app/generated/prisma/client";

import { canEditShiftMembers, canViewShiftBasic } from "#app/utils/permissions";
import prisma from "#app/utils/prisma";
import { getSessionUser } from "#app/utils/session";
import MailService from "#app/services/mailService";

import {
  type CreateInviteBody,
  type PatchUserBody,
  RequestPasswordResetBody,
  type SignupBody,
  UserCreateSchema,
  type UserParams,
} from "#app/schemas/user";
import type { JSendError, JSendResponse } from "#app/schemas/jsend";
import { UnknownData } from "#app/schemas/jsend";
import { createFailResponse } from "#app/utils/jsend";

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

export const validatePasswordPolicy = (password: string): string | null => {
  if (password.length < 8) return "Salasõna on liiga lühike.";
  return null;
};

interface IPatchUserHandler extends RouteGenericInterface {
  Params: UserParams;
  Body: PatchUserBody;
  Reply: JSendResponse<typeof UnknownData, typeof UnknownData> | null;
}

export const patchUserHandler = async (
  req: FastifyRequest<IPatchUserHandler>,
  res: FastifyReply<IPatchUserHandler>,
): Promise<never> => {
  const { userId } = req.params;
  const requesterId = getSessionUser(req).userId;

  if (userId !== requesterId) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { userId: "Muuta saab ainult enda kasutajat." },
    });
  }

  const currentShift = req.body.currentShift;
  if (currentShift !== undefined) {
    if (!(await canViewShiftBasic(requesterId, currentShift))) {
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

  return res.status(StatusCodes.NO_CONTENT).send(null);
};

interface IInviteUserHandler extends RouteGenericInterface {
  Body: CreateInviteBody;
  Reply:
    | JSendResponse<typeof UnknownData, typeof UnknownData>
    | JSendError
    | null;
}

export const inviteUserHandler = async (
  req: FastifyRequest<IInviteUserHandler>,
  res: FastifyReply<IInviteUserHandler>,
): Promise<never> => {
  const { userId } = getSessionUser(req);
  const { shiftNr, email } = req.body;

  if (!(await canEditShiftMembers(userId, shiftNr))) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { permissions: "Puuduvad õigused kasutaja loomiseks!" },
    });
  }

  const permissionRoleMap = {
    instructor: "instructor",
    helper: "helper",
  } as const;

  type PermissionRole = keyof typeof permissionRoleMap;

  const desiredRole = req.body.role;
  if (!(desiredRole in permissionRoleMap)) {
    return res.status(StatusCodes.UNPROCESSABLE_ENTITY).send({
      status: "fail",
      data: { role: `Roll '${desiredRole}' ei ole valikus.` },
    });
  }

  // TODO: find a more elegant and flexible way to do this.
  const displayRole = desiredRole === "instructor" ? "full" : "part";
  const currentYear = new Date().getUTCFullYear();

  // Register the user as a staff member, if not already.
  const staffMember = await prisma.shiftStaff.findUnique({
    where: {
      shiftNr_year_name: { shiftNr, year: currentYear, name: req.body.name },
    },
  });

  const user = await prisma.user.findUnique({
    where: { email: req.body.email },
    select: { id: true },
  });

  // Do not send an account creation email if the user already exists.
  if (user) {
    if (!staffMember) {
      await prisma.shiftStaff.create({
        data: {
          shiftNr,
          year: currentYear,
          name: req.body.name,
          role: displayRole,
          userId: user.id,
        },
      });
    } else {
      // Link the existing staff entry with the existing user.
      await prisma.shiftStaff.update({
        where: { id: staffMember.id },
        data: { userId: user.id },
      });
    }

    return res.status(StatusCodes.NO_CONTENT).send(null);
  }

  const dbRole = await prisma.role.findUnique({
    where: { roleName: permissionRoleMap[desiredRole as PermissionRole] },
    select: { id: true },
  });
  if (!dbRole) {
    return res.status(StatusCodes.UNPROCESSABLE_ENTITY).send({
      status: "fail",
      data: { role: `Roll '${desiredRole}' ei ole valikus.` },
    });
  }

  const token = uuidv4();
  await prisma.$transaction(async (tx) => {
    if (!staffMember) {
      await tx.shiftStaff.create({
        data: {
          shiftNr,
          year: currentYear,
          name: req.body.name,
          role: displayRole,
          userId: null,
        },
      });
    }

    await tx.signupToken.create({
      data: { token, email, shiftNr, displayRole, roleId: dbRole.id },
    });
  });

  const mailService = new MailService(req.server.mailer);
  try {
    await mailService.sendSignupToken(email, token, req.body.name);
  } catch (err) {
    req.log.error({ err, email }, "Failed to send signup token email");
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Ootamatu viga arve saatmise.",
    });
  }

  return res.status(StatusCodes.NO_CONTENT).send(null);
};

interface IRequestPasswordResetHandler extends RouteGenericInterface {
  Body: RequestPasswordResetBody;
  Reply: null;
}

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

    const mailService = new MailService(req.server.mailer);
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
  if (!rejectReason) {
    return res
      .status(StatusCodes.UNPROCESSABLE_ENTITY)
      .send(createFailResponse({ password: rejectReason }));
  }

  const isOlderThan24h =
    Date.now() - new Date(tokenEntry.createdAt).getTime() > 24 * 60 * 60 * 1000;
  if (isOlderThan24h) {
    await prisma.resetToken.delete({ where: { token } });
    return res.status(StatusCodes.FORBIDDEN).send();
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await prisma.user.update({
    where: { id: tokenEntry.userId },
    data: { password: passwordHash },
  });

  await prisma.resetToken.delete({ where: { token } });

  return res.status(StatusCodes.NO_CONTENT).send(null);
};

interface ISignupUserHandler extends RouteGenericInterface {
  Body: SignupBody;
  Reply:
    | JSendResponse<typeof UnknownData, typeof UnknownData>
    | JSendError
    | null;
}

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
  if (!rejectReason) {
    return res
      .status(StatusCodes.UNPROCESSABLE_ENTITY)
      .send(createFailResponse({ password: rejectReason }));
  }

  const now = new Date();

  const diffMs = Math.abs(now.getTime() - signupData.createdAt.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours > 24) {
    await prisma.signupToken.update({
      where: { token },
      data: { isExpired: true },
    });
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { token: `Pääsmik on aegunud.` },
    });
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(req.body.password, saltRounds);

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
