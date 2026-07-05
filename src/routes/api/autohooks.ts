import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";

import { createFailResponse } from "#app/lib/jsend";

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
      return reply
        .code(StatusCodes.UNAUTHORIZED)
        .send(
          createFailResponse({ message: "Ligipääsuks pead olema autenditud" }),
        );
    }
  });
}
