import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

import prisma from "../../utils/prisma";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (server) => {
  // Prisma declared like this will have to manually be drilled down
  // the function chain in everything that is not a route/controller.
  // const prisma = new PrismaClient();

  await prisma.$connect();

  server.decorate("prisma", prisma);

  server.addHook("onClose", async (server) => {
    await server.prisma.$disconnect();
  });
});

export default prismaPlugin;
