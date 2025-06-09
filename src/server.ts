import path from "node:path";
import "dotenv/config";

import Fastify from "fastify";
import fastifyAutoload from "@fastify/autoload";
import cors from "@fastify/cors";

const fastify = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      removeAdditional: false,
    },
  },
});

fastify.register(cors, {
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }

    const hostname = new URL(origin).hostname;
    if (hostname === "localhost") {
      cb(null, true);
      return;
    }

    cb(new Error("Not allowed"), false);
  },
});

fastify.register(fastifyAutoload, {
  dir: path.join(__dirname, "plugins/external"),
});

fastify.register(fastifyAutoload, {
  dir: path.join(__dirname, "plugins/app"),
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
