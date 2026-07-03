import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import prisma from "#app/utils/prisma";
import { createFailResponse, createSuccessResponse } from "#app/utils/jsend";

import {
  TeamCreationSchema,
  TeamRecord,
  TeamRecordSchema,
  TeamsFetchSchema,
} from "#app/schemas/team";
import type { JSendFail, JSendResponse } from "#app/schemas/jsend";
import { canEditShiftBasic, canViewShiftBasic } from "#app/utils/permissions";
import { getSessionUser } from "#app/utils/session";
import { getCurrentCampYear } from "#app/utils/campYear";
import { RequestPermissionsFail } from "#app/schemas/responses";
import type { Route } from "#app/schemas/route";

export const FetchTeamsData = Type.Object({
  teams: Type.Array(TeamRecordSchema),
});

type IFetchTeamsHandler = Route<{ querystring: typeof TeamsFetchSchema }> & {
  Reply:
    | JSendResponse<typeof FetchTeamsData>
    | JSendFail<typeof RequestPermissionsFail>;
};

export const fetchTeamsHandler = async (
  req: FastifyRequest<IFetchTeamsHandler>,
  res: FastifyReply<IFetchTeamsHandler>,
): Promise<never> => {
  const { userId } = getSessionUser(req);
  const { shiftNr } = req.query;

  const isAuthorised = await canViewShiftBasic(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const teams: TeamRecord[] = await prisma.team.findMany({
    where: { shiftNr, year: getCurrentCampYear() },
    select: {
      id: true,
      shiftNr: true,
      name: true,
      year: true,
      place: true,
      captainId: true,
    },
  });

  return res.status(StatusCodes.OK).send(createSuccessResponse({ teams }));
};

export const TeamCreationFailData = Type.Object({
  name: Type.String(),
});

type ITeamCreationHandler = Route<{ body: typeof TeamCreationSchema }> & {
  Reply: JSendFail<
    typeof TeamCreationFailData | typeof RequestPermissionsFail
  > | null;
};

export const teamCreationHandler = async (
  req: FastifyRequest<ITeamCreationHandler>,
  res: FastifyReply<ITeamCreationHandler>,
): Promise<never> => {
  const { userId } = getSessionUser(req);

  const { shiftNr, name } = req.body;
  const year = getCurrentCampYear();

  const isAuthorised = await canEditShiftBasic(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  await prisma.team.create({
    data: { shiftNr, name, year },
  });

  return res.status(StatusCodes.CREATED).send(null);
};
