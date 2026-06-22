import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";

declare module "fastify" {
  interface FastifyContextConfig {
    // Opt out of authentication by setting `config: { public: true }`.
    public?: boolean;
  }
}

export default async function (fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.routeOptions.config?.public) {
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
