import { v4 as uuidv4 } from "uuid";
import type { Transporter } from "nodemailer";
import type { FastifyBaseLogger } from "fastify";

import prisma from "#app/lib/prisma";
import { canViewShiftBasic } from "#app/lib/permissions";
import { getCurrentCampYear } from "#app/lib/camp-year";
import MailService from "#app/services/mail.service";

import type { CreateInviteBody, PatchUserBody } from "./users.schemas";

export type PatchUserResult = "ok" | "not-shift-member";

export const patchUser = async (
  requesterId: number,
  patchData: PatchUserBody,
): Promise<PatchUserResult> => {
  const currentShift = patchData.currentShift;
  if (currentShift !== undefined) {
    if (!(await canViewShiftBasic(requesterId, currentShift))) {
      return "not-shift-member";
    }

    await prisma.user.update({
      where: { id: requesterId },
      data: patchData,
    });
  }

  return "ok";
};

export type InviteResult =
  | "invalid-role"
  | "linked"
  | "mail-failed"
  | "invited";

export const inviteUser = async (
  body: CreateInviteBody,
  mailer: Transporter,
  appUrl: string,
  log: FastifyBaseLogger,
): Promise<InviteResult> => {
  const { shiftNr, email } = body;

  const permissionRoleMap = {
    instructor: "instructor",
    helper: "helper",
  } as const;

  type PermissionRole = keyof typeof permissionRoleMap;

  const desiredRole = body.role;
  if (!Object.hasOwn(permissionRoleMap, desiredRole)) {
    return "invalid-role";
  }

  // TODO: find a more elegant and flexible way to do this.
  const displayRole = desiredRole === "instructor" ? "full" : "part";
  const currentYear = getCurrentCampYear();

  // Register the user as a staff member, if not already.
  const staffMember = await prisma.shiftStaff.findUnique({
    where: {
      shiftNr_year_name: { shiftNr, year: currentYear, name: body.name },
    },
  });

  const user = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });

  // Do not send an account creation email if the user already exists.
  if (user) {
    if (!staffMember) {
      await prisma.shiftStaff.create({
        data: {
          shiftNr,
          year: currentYear,
          name: body.name,
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

    return "linked";
  }

  const dbRole = await prisma.role.findUnique({
    where: { roleName: permissionRoleMap[desiredRole as PermissionRole] },
    select: { id: true },
  });
  if (!dbRole) {
    return "invalid-role";
  }

  const token = uuidv4();
  await prisma.$transaction(async (tx) => {
    if (!staffMember) {
      await tx.shiftStaff.create({
        data: {
          shiftNr,
          year: currentYear,
          name: body.name,
          role: displayRole,
          userId: null,
        },
      });
    }

    await tx.signupToken.create({
      data: { token, email, shiftNr, displayRole, roleId: dbRole.id },
    });
  });

  const mailService = new MailService(mailer, appUrl);
  try {
    await mailService.sendSignupToken(email, token, body.name);
  } catch (err) {
    log.error({ err, email }, "Failed to send signup token email");
    return "mail-failed";
  }

  return "invited";
};
