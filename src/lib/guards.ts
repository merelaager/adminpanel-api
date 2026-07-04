import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { StatusCodes } from "http-status-codes";

import { createFailResponse } from "#app/lib/jsend";
import { getSessionUser } from "#app/lib/session";
import {
  getRegistrationViewFlags,
  isSuperRoot,
  userHasPermissionInAnyShift,
  userHasShiftPermission,
  type RegistrationViewFlags,
} from "#app/lib/permissions";
import { Permissions } from "#app/constants/permissions";

type ShiftNrSource = "params" | "query" | "body";

const DEFAULT_MESSAGE = "Puuduvad õigused päringuks.";

// body is parsed and validated before preHandler runs, so reading shiftNr from
// any of these sources is safe.
const getShiftNr = (request: FastifyRequest, source: ShiftNrSource): number =>
  (request[source] as { shiftNr: number }).shiftNr;

// 403 with { status:"fail", data:{ permissions: message } } when the check fails.
export const requireShiftPermission =
  (
    permission: Permissions,
    source: ShiftNrSource,
    message = DEFAULT_MESSAGE,
  ): preHandlerAsyncHookHandler =>
  async (request, reply) => {
    const { userId } = getSessionUser(request);
    const shiftNr = getShiftNr(request, source);
    if (!(await userHasShiftPermission(userId, shiftNr, permission))) {
      return reply
        .status(StatusCodes.FORBIDDEN)
        .send(createFailResponse({ permissions: message }));
    }
  };

// Permission in ANY shift (wraps userHasPermissionInAnyShift).
export const requireAnyShiftPermission =
  (permission: Permissions, message: string): preHandlerAsyncHookHandler =>
  async (request, reply) => {
    const { userId } = getSessionUser(request);
    if (!(await userHasPermissionInAnyShift(userId, permission))) {
      return reply
        .status(StatusCodes.FORBIDDEN)
        .send(createFailResponse({ permissions: message }));
    }
  };

// Registration-view flag requirements (§4.2). All `required` keys must be true.
export const requireRegistrationView =
  (
    required: Array<keyof RegistrationViewFlags>,
    source: ShiftNrSource,
    message = DEFAULT_MESSAGE,
  ): preHandlerAsyncHookHandler =>
  async (request, reply) => {
    const { userId } = getSessionUser(request);
    const shiftNr = getShiftNr(request, source);
    const flags = await getRegistrationViewFlags(userId, shiftNr);
    if (!required.every((key) => flags[key])) {
      return reply
        .status(StatusCodes.FORBIDDEN)
        .send(createFailResponse({ permissions: message }));
    }
  };

// isSuperRoot check. On failure: empty 403 body, matching current
// /registrations/sync behavior exactly.
export const requireRoot: preHandlerAsyncHookHandler = async (
  request,
  reply,
) => {
  const { userId } = getSessionUser(request);
  if (!(await isSuperRoot(userId))) {
    return reply.status(StatusCodes.FORBIDDEN).send();
  }
};
