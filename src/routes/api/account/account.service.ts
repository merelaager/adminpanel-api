import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import type { Transporter } from "nodemailer";
import type { FastifyBaseLogger } from "fastify";

import prisma from "#app/lib/prisma";
import { deleteUserSessions } from "#app/lib/session";
import { validatePasswordPolicy } from "#app/lib/password";
import { SALT_ROUNDS, TOKEN_EXPIRY_MS } from "#app/constants/auth";
import MailService from "#app/services/mail.service";

// Always resolves without signalling whether the email exists (no enumeration).
export const requestPasswordReset = async (
  email: string,
  mailer: Transporter,
  appUrl: string,
  log: FastifyBaseLogger,
): Promise<void> => {
  const userData = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (userData === null) {
    return;
  }

  const token = uuidv4();
  await prisma.resetToken.create({
    data: { token, userId: userData.id },
  });

  const mailService = new MailService(mailer, appUrl);
  try {
    await mailService.sendPasswordResetToken(email, token);
  } catch (err) {
    log.error({ err, email }, "Failed to send password reset email");
  }
};

export type ConfirmPasswordResetResult =
  | { status: "forbidden" }
  | { status: "weak-password"; reason: string }
  | { status: "ok" };

export const confirmPasswordReset = async (
  token: string,
  password: string,
): Promise<ConfirmPasswordResetResult> => {
  const tokenEntry = await prisma.resetToken.findUnique({
    where: { token },
  });
  if (!tokenEntry) {
    return { status: "forbidden" };
  }

  const rejectReason = validatePasswordPolicy(password);
  if (rejectReason) {
    return { status: "weak-password", reason: rejectReason };
  }

  const isOlderThan24h =
    Date.now() - new Date(tokenEntry.createdAt).getTime() > TOKEN_EXPIRY_MS;
  if (isOlderThan24h) {
    await prisma.resetToken.delete({ where: { token } });
    return { status: "forbidden" };
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: tokenEntry.userId },
      data: { password: passwordHash },
    });

    await deleteUserSessions(tokenEntry.userId, undefined, tx);
    await tx.resetToken.deleteMany({ where: { userId: tokenEntry.userId } });
  });

  return { status: "ok" };
};
