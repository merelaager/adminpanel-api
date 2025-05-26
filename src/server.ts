import path from "node:path";
import "dotenv/config";

import Fastify from "fastify";
import fastifyAutoload from "@fastify/autoload";

const fastify = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      removeAdditional: false,
    },
  },
});

fastify.register(fastifyAutoload, {
  dir: path.join(__dirname, "plugins/external"),
});

fastify.register(fastifyAutoload, {
  dir: path.join(__dirname, "routes"),
  autoHooks: true,
  cascadeHooks: true,
});

const start = async () => {
  try {
    await fastify.listen({ port: 4000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
