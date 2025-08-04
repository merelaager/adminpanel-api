import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";

export default async function (fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/auth/login")) {
      return;
    }

    if (request.url.startsWith("/api/auth/signup")) {
      return;
    }

    if (request.url.startsWith("/api/account/password")) {
      return;
    }

    // TODO: put registration creation behind authentication.
    if (request.url === "/api/registrations" && request.method === "POST") {
      return;
    }

    if (!request.session.user) {
      return reply.code(StatusCodes.UNAUTHORIZED).send({
        status: "fail",
        data: { message: "Ligipääsuks pead olema autenditud" },
      });
    }
  });
}
