import path from "node:path";

import Fastify, { FastifyInstance } from "fastify";
import fastifyAutoload from "@fastify/autoload";
import fastifyEnv from "@fastify/env";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { envSchema } from "./config/env";

const CORS_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE", "PUT"];

const allowedStaticOrigins = [
  "https://dev.merelaager.ee",
  "https://sild.merelaager.ee",
];
const allowedDomainPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export interface BuildAppOptions {
  rateLimit?: boolean;
}

export const buildApp = (opts: BuildAppOptions = {}): FastifyInstance => {
  const { rateLimit: enableRateLimit = true } = opts;

  const fastify = Fastify({
    logger: true,
    // No-op without proxy
    trustProxy: true,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  });

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

  if (enableRateLimit) {
    fastify.register(rateLimit, {
      global: false,
    });
  }

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
    ignorePattern: /\.(?:service|schemas)\.(?:ts|js)$/,
  });

  return fastify;
};
