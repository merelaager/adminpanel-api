import "../helpers/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyReply, FastifyRequest } from "fastify";

import { requireShiftPermission } from "#app/lib/guards";
import { Permissions } from "#app/constants/permissions";

// After the §3.3 hardening, a mis-wired guard whose source carries no integer
// shiftNr must throw (surfacing as a 500) rather than silently passing
// `undefined` into the permission query. The throw precedes any DB call.
void test("requireShiftPermission rejects when the source lacks an integer shiftNr", async () => {
  // The hook handler declares a `this: FastifyInstance` context; drop it so it
  // can be called directly in the test.
  const handler = requireShiftPermission(
    Permissions.VIEW_SHIFT_BASIC,
    "params",
  ) as (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

  const request = {
    params: {},
    session: { user: { userId: 1 } },
  } as unknown as FastifyRequest;

  // Never actually invoked: getShiftNr throws before the guard touches reply.
  const reply = {
    status: () => reply,
    send: () => reply,
  } as unknown as FastifyReply;

  await assert.rejects(() => handler(request, reply));
});
