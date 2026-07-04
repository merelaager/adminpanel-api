import fp from "fastify-plugin";
import fastifySession from "@fastify/session";
import fastifyCookie from "@fastify/cookie";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";

import prisma from "#app/lib/prisma";
import { requiresSecureCookies } from "#app/config/env";
import type { Auth } from "#app/lib/session";

declare module "fastify" {
  interface Session {
    user?: Auth;
  }
}

export default fp(
  async (fastify) => {
    const defaultTTL = 1000 * 60 * 60 * 7;

    fastify.register(fastifyCookie);
    fastify.register(fastifySession, {
      secret: fastify.config.COOKIE_SECRET,
      cookie: {
        secure: requiresSecureCookies(fastify.config.NODE_ENV),
        domain: fastify.config.COOKIE_DOMAIN,
        sameSite: "lax",
        httpOnly: true,
        maxAge: defaultTTL,
      },
      saveUninitialized: false,
      rolling: true, // Constantly update the cookie, allowing for shorter TTL.
      store: new PrismaSessionStore(prisma, {
        checkPeriod: defaultTTL,
        dbRecordIdIsSessionId: true,
        dbRecordIdFunction: undefined,
      }),
    });
  },
  { name: "session" },
);
