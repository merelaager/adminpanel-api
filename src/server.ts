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

const CORS_METHODS = ["GET", "HEAD", "POST"];
if (process.env.NODE_ENV === "development") {
  CORS_METHODS.push("PATCH");
}

fastify.register(cors, {
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }

    const hostname = new URL(origin).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      cb(null, true);
      return;
    }

    cb(new Error("Not allowed"), false);
  },
  methods: CORS_METHODS,
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
  const serverPort = process.env.PORT ? parseInt(process.env.PORT) : 4000;
  try {
    await fastify.listen({ port: serverPort });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
