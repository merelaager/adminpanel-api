import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { ErrorResponse } from "#app/lib/jsend";

const schemasPlugin: FastifyPluginAsync = fp(async (server) => {
  server.addSchema(ErrorResponse);
});

export default schemasPlugin;
