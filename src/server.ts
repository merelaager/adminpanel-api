import { buildApp } from "./app";

const fastify = buildApp();

const start = async () => {
  try {
    await fastify.ready();
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
    process.exit(0);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

process.on("SIGTERM", closeGracefully);
process.on("SIGINT", closeGracefully);
