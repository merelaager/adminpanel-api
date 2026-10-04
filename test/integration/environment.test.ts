import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import loadEnv from "env-schema";

import "../helpers/test-env";
import { buildApp } from "#app/app";
import { envSchema } from "#app/config/env";

let app: FastifyInstance;

before(async () => {
  app = buildApp({ rateLimit: false });
  await app.ready();
});

after(async () => {
  await app.close();
});

const requestFrom = (origin: string) =>
  app.inject({
    method: "GET",
    url: "/api/app/version?platform=ios",
    headers: { origin },
  });

void test("CORS allows the production frontend", async () => {
  const res = await requestFrom("https://sild.merelaager.ee");
  assert.equal(
    res.headers["access-control-allow-origin"],
    "https://sild.merelaager.ee",
  );
});

void test("CORS rejects other origins", async () => {
  const res = await requestFrom("https://example.com");
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

void test("CORS rejects localhost outside development", async () => {
  const res = await requestFrom("http://localhost:5173");
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

void test("API docs are not served outside development", async () => {
  const res = await app.inject({ method: "GET", url: "/documentation" });
  assert.equal(res.statusCode, 404);
});

const startsWithNodeEnv = async (value: string) => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = value;

  const instance = buildApp({ rateLimit: false, docs: false });
  try {
    await instance.ready();
    return true;
  } catch {
    return false;
  } finally {
    process.env.NODE_ENV = original;
    await instance.close();
  }
};

void test("config is rejected when NODE_ENV is missing", () => {
  const data = { ...process.env };
  delete data.NODE_ENV;
  assert.throws(() =>
    loadEnv({ schema: envSchema, data, env: false, dotenv: false }),
  );
});

void test("startup fails when NODE_ENV is misspelled", async () => {
  assert.equal(await startsWithNodeEnv("prod"), false);
});
