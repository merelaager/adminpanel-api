import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";

export default async function (fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/auth/login")) {
      return;
    }

    if (!request.session.user) {
      return reply.code(StatusCodes.UNAUTHORIZED).send({
        status: "fail",
        data: { message: "You must be authenticated to access this route!" },
      });
    }
  });
}
