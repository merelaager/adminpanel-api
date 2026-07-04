import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import prisma from "#app/lib/prisma";
import { canEditShiftBasic, canViewShiftBasic } from "#app/lib/permissions";
import { getSessionUser } from "#app/lib/session";
import { createFailResponse, createSuccessResponse } from "#app/lib/jsend";
import { getCurrentCampYear } from "#app/lib/camp-year";

import {
  AddGradeSchema,
  ShiftResourceFetchParams,
  ShiftTentQuerySchema,
} from "#app/schemas/shift";
import type { JSendResponse } from "#app/lib/jsend";
import { TentInfoSchema, TentScoreSchema } from "#app/schemas/tent";
import { RequestPermissionsFail } from "#app/lib/jsend";
import type { Route } from "#app/schemas/route";

type IFetchTentHandler = Route<{ params: typeof ShiftTentQuerySchema }> & {
  Reply: JSendResponse<typeof TentInfoSchema, typeof RequestPermissionsFail>;
};

export const fetchTentHandler = async (
  req: FastifyRequest<IFetchTentHandler>,
  res: FastifyReply<IFetchTentHandler>,
): Promise<never> => {
  const { shiftNr, tentNr } = req.params;
  const { userId } = getSessionUser(req);

  const isAuthorised = await canViewShiftBasic(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const currentYear = getCurrentCampYear();

  const records = await prisma.record.findMany({
    where: { shiftNr, year: currentYear, tentNr, isActive: true },
    select: { child: { select: { name: true } } },
  });

  const childrenInTent = records.map((record) => record.child.name);

  const tentScores = await prisma.tentScore.findMany({
    where: { shiftNr, year: currentYear, tentNr },
    select: { score: true, createdAt: true, tentNr: true, id: true },
    orderBy: { createdAt: "asc" },
  });

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      campers: childrenInTent,
      scores: tentScores.map((score) => {
        return {
          ...score,
          scoreId: score.id,
          createdAt: score.createdAt.toISOString(),
        };
      }),
    }),
  );
};

export const FetchTentsData = Type.Object({
  scores: Type.Array(TentScoreSchema),
});

type IFetchTentsHandler = Route<{
  params: typeof ShiftResourceFetchParams;
}> & {
  Reply: JSendResponse<typeof FetchTentsData, typeof RequestPermissionsFail>;
};

export const fetchTentsHandler = async (
  req: FastifyRequest<IFetchTentsHandler>,
  res: FastifyReply<IFetchTentsHandler>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = getSessionUser(req);

  const isAuthorised = await canViewShiftBasic(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const currentYear = getCurrentCampYear();

  const tentScores = await prisma.tentScore.findMany({
    where: { shiftNr, year: currentYear },
    select: { score: true, createdAt: true, tentNr: true, id: true },
    orderBy: { createdAt: "asc" },
  });

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      scores: tentScores.map((score) => {
        return {
          ...score,
          scoreId: score.id,
          createdAt: score.createdAt.toISOString(),
        };
      }),
    }),
  );
};

type IAddGradeHandler = Route<{
  params: typeof ShiftTentQuerySchema;
  body: typeof AddGradeSchema;
}> & {
  Reply: JSendResponse<typeof TentScoreSchema, typeof RequestPermissionsFail>;
};

export const addGradeHandler = async (
  req: FastifyRequest<IAddGradeHandler>,
  res: FastifyReply<IAddGradeHandler>,
): Promise<never> => {
  const { shiftNr, tentNr } = req.params;
  const { score } = req.body;
  const { userId } = getSessionUser(req);

  const isAuthorised = await canEditShiftBasic(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const currentYear = getCurrentCampYear();
  const result = await prisma.tentScore.create({
    data: {
      shiftNr,
      tentNr,
      year: currentYear,
      score: score,
    },
    select: { score: true, createdAt: true, tentNr: true, id: true },
  });

  return res.status(StatusCodes.CREATED).send(
    createSuccessResponse({
      ...result,
      scoreId: result.id,
      createdAt: result.createdAt.toISOString(),
    }),
  );
};
