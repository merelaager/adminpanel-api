import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { build } from "./helpers/build";

let app: FastifyInstance;

before(async () => {
  app = await build();
});

after(async () => {
  await app.close();
});

test("GET /api/app/version returns JSend JSON", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/app/version?platform=android",
  });
  assert.ok(res.statusCode === 200 || res.statusCode === 404);
  const body = res.json();
  assert.ok(body.status === "success" || body.status === "error");
});

test("GET /api/shifts without cookie is unauthorised", async () => {
  const res = await app.inject({ method: "GET", url: "/api/shifts" });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().status, "fail");
});

test("POST /api/auth/login with bad credentials fails", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "__refactor_smoke__", password: "x" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().status, "fail");
});

test("POST /api/registrations with empty body is a bad request", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/registrations",
    payload: {},
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().status, "fail");
});
