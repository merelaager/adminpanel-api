import path from "node:path";

import Fastify, { FastifyInstance } from "fastify";
import fastifyAutoload from "@fastify/autoload";
import fastifyEnv from "@fastify/env";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

import { envSchema } from "./config/env";

const CORS_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE", "PUT"];

const allowedStaticOrigins = [
  "https://dev.merelaager.ee",
  "https://sild.merelaager.ee",
];
const allowedDomainPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export interface BuildAppOptions {
  rateLimit?: boolean;
  docs?: boolean;
}

export const buildApp = (opts: BuildAppOptions = {}): FastifyInstance => {
  const {
    rateLimit: enableRateLimit = true,
    docs: enableDocs = process.env.NODE_ENV !== "production",
  } = opts;

  const fastify = Fastify({
    logger: true,
    trustProxy: "loopback",
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
      errorResponseBuilder: (_req, context) => ({
        statusCode: context.statusCode,
        message: "Liiga palju päringuid. Proovi hiljem uuesti.",
      }),
    });
  }

  fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Merelaager API",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "sessionId",
          },
        },
      },
    },
    transform: ({ schema, url, route }) => {
      // Group operations in the UI by feature.
      const feature = url.split("/").filter(Boolean)[1];
      const tags =
        schema?.tags ??
        (feature ? [feature[0].toUpperCase() + feature.slice(1)] : undefined);

      // Document session auth on every route not opted out via
      // config: { public: true }.
      const secured = !(route.config?.public || schema?.hide);

      return {
        url,
        schema: {
          ...schema,
          ...(tags ? { tags } : {}),
          ...(secured ? { security: [{ sessionCookie: [] }] } : {}),
        },
      };
    },
  });

  if (enableDocs) {
    fastify.register(fastifySwaggerUi, {
      routePrefix: "/documentation",
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
