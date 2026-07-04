import type { FastifyRequest } from "fastify";

import prisma from "#app/lib/prisma";

export interface Auth {
  userId: number;
}

export const getSessionUser = (request: FastifyRequest): Auth => {
  const user = request.session.user;
  if (!user) {
    throw new Error("Session user is missing but protected route was accessed");
  }
  return user;
};

export const deleteUserSessions = async (
  userId: number,
  exceptSessionId?: string,
): Promise<void> => {
  const sessions = await prisma.session.findMany({
    select: { id: true, data: true },
  });

  const staleSessionIds = sessions
    .filter((session) => {
      if (session.id === exceptSessionId) return false;
      try {
        const parsed: { user?: Auth } = JSON.parse(session.data);
        return parsed.user?.userId === userId;
      } catch {
        return false;
      }
    })
    .map((session) => session.id);

  if (staleSessionIds.length === 0) return;

  await prisma.session.deleteMany({
    where: { id: { in: staleSessionIds } },
  });
};
