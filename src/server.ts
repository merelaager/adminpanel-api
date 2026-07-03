import path from "node:path";

import Fastify from "fastify";
import fastifyAutoload from "@fastify/autoload";
import fastifyEnv from "@fastify/env";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { envSchema } from "./config/env";

const fastify = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      removeAdditional: false,
    },
  },
});

const CORS_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE", "PUT"];

const allowedStaticOrigins = [
  "https://dev.merelaager.ee",
  "https://sild.merelaager.ee",
];
const allowedDomainPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

fastify.register(fastifyEnv, { schema: envSchema, dotenv: true });

fastify.register(cors, {
  credentials: true,
  origin: (origin, cb) => {
    if (
      !origin ||
      allowedStaticOrigins.includes(origin) ||
      (fastify.config.NODE_ENV !== "production" &&
        allowedDomainPattern.test(origin))
    ) {
      cb(null, true);
      return;
    }

    cb(new Error("Not allowed by CORS"), false);
  },
  methods: CORS_METHODS,
});

fastify.register(rateLimit, {
  global: false,
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
