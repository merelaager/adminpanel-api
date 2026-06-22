import type { FastifyRequest } from "fastify";

import type { Auth } from "../schemas/auth";

export const getSessionUser = (request: FastifyRequest): Auth => {
  const user = request.session.user;
  if (!user) {
    throw new Error("Session user is missing but protected route was accessed");
  }
  return user;
};
