import type { FastifyInstance } from "fastify";

import { buildApp } from "#app/app";

// Builds the app with rate limiting disabled so per-route limits cannot cause
// 429 flakiness in tests. Callers must await ready() (done here) and close it.
export const build = async (): Promise<FastifyInstance> => {
  const app = buildApp({ rateLimit: false });
  await app.ready();
  return app;
};
