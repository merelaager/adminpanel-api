import "dotenv/config";

import fp from "fastify-plugin";
import fastifySession from "@fastify/session";
import fastifyCookie from "@fastify/cookie";

import { Auth } from "../../schemas/auth";

declare module "fastify" {
  interface Session {
    user: Auth;
  }
}

export default fp(
  async (fastify) => {
    const sessionSecret = process.env.COOKIE_SECRET;

    if (!sessionSecret) {
      throw new Error("Could not find session secret");
    }

    fastify.register(fastifyCookie);
    fastify.register(fastifySession, {
      secret: sessionSecret,
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 1800000,
      },
    });
  },
  { name: "session" },
);
