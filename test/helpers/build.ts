import "./test-env";
import type { FastifyInstance } from "fastify";

import { buildApp } from "#app/app";

// Builds the app with rate limiting disabled so per-route limits cannot cause
// 429 flakiness in tests, and the docs UI disabled so its routes stay out of
// the route-table snapshot. Callers must await ready() (done here) and close it.
export const build = async (): Promise<FastifyInstance> => {
  const app = buildApp({ rateLimit: false, docs: false });
  await app.ready();
  return app;
};
