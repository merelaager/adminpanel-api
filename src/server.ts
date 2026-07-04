import { buildApp } from "./app";
import prisma from "#app/lib/prisma";
import { requiresSecureCookies } from "#app/config/env";

const fastify = buildApp();

const start = async () => {
  try {
    await fastify.ready();

    const { NODE_ENV } = fastify.config;
    const secureCookies = requiresSecureCookies(NODE_ENV);
    fastify.log.info({ nodeEnv: NODE_ENV, secureCookies });

    await prisma.$connect();
    await fastify.listen({ port: fastify.config.PORT });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

const closeGracefully = async (signal: NodeJS.Signals) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully`);
  try {
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

process.on("SIGTERM", closeGracefully);
process.on("SIGINT", closeGracefully);
