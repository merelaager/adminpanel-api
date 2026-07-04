import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";

import prisma from "#app/lib/prisma";

const prismaPlugin: FastifyPluginAsync = fp(async (server) => {
  await prisma.$connect();

  server.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});

export default prismaPlugin;
