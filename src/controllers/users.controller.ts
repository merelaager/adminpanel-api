import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { Static } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { Prisma, type PrismaClient } from "@prisma/client";

import { isShiftBoss, isShiftMember } from "../utils/permissions";
import prisma from "../utils/prisma";
import MailService from "../services/mailService";

import {
  type CreateInviteBody,
  type PatchUserBody,
  type SignupBody,
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

interface IInviteUserHandler extends RouteGenericInterface {
  Body: CreateInviteBody;
  Reply: JSendResponse;
}

export const inviteUserHandler = async (
  req: FastifyRequest<IInviteUserHandler>,
  res: FastifyReply<IInviteUserHandler>,
): Promise<never> => {
  const { userId } = req.session.user;
  const { shiftNr, email } = req.body;

  if (!(await isShiftBoss(userId, shiftNr))) {
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

  if (!staffMember) {
    await prisma.shiftStaff.create({
      data: {
        shiftNr,
        year: currentYear,
        name: req.body.name,
        role: displayRole,
        userId: user?.id ?? null,
      },
    });
  } else if (user) {
    // Link the existing staff entry with the existing user.
    await prisma.shiftStaff.update({
      where: { id: staffMember.id },
      data: { userId: user.id },
    });
  }

  // Do not send an account creation email if the user already exists.
  if (user) return res.status(StatusCodes.NO_CONTENT).send();

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
  await prisma.signupToken.create({
    data: { token, email, shiftNr, displayRole, roleId: dbRole.id },
  });

  const mailService = new MailService(req.server.mailer);
  try {
    await mailService.sendSignupToken(email, token, req.body.name);
  } catch (err) {
    console.error("Email was", email);
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Ootamatu viga arve saatmise.",
    });
  }

  return res.status(StatusCodes.NO_CONTENT).send();
};

interface ISignupUserHandler extends RouteGenericInterface {
  Body: SignupBody;
  Reply: JSendResponse;
}

export const signupUserHandler = async (
  req: FastifyRequest<ISignupUserHandler>,
  res: FastifyReply<ISignupUserHandler>,
): Promise<never> => {
  const signupData = await prisma.signupToken.findUnique({
    where: { token: req.body.token, isExpired: false },
  });

  if (!signupData) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { token: `Pääsmik ei kehti.` },
    });
  }

  const now = new Date();

  const diffMs = Math.abs(now.getTime() - signupData.createdAt.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours > 24) {
    await prisma.signupToken.update({
      where: { token: req.body.token },
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
    const user = await prisma.user.create({
      data: {
        username: req.body.username.trim(),
        currentShift: signupData.shiftNr,
        name: req.body.name.trim(),
        email: req.body.email,
        nickname: req.body.nickname || req.body.name.split(" ")[0],
        password: passwordHash,
      },
    });
    // Consume the token.
    await prisma.signupToken.update({
      where: { token: req.body.token },
      data: { isExpired: true, usedDate: new Date() },
    });
    // Assign permissions
    if (signupData.roleId) {
      await prisma.userRoles.create({
        data: {
          shiftNr: signupData.shiftNr,
          userId: user.id,
          roleId: signupData.roleId,
        },
      });
    }
  } catch (err) {
    console.error(err);
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return res.status(StatusCodes.CONFLICT).send({
          status: "fail",
          data: {
            conflict: "Kasutajanimi või meiliaadress on juba kasutuses.",
          },
        });
      }
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Serveri viga kasutaja loomisel.",
    });
  }

  return res.status(StatusCodes.CREATED).send();
};
