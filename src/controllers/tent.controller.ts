import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import prisma from "../utils/prisma";
import { isShiftMember } from "../utils/permissions";
import { createFailResponse, createSuccessResponse } from "../utils/jsend";

import {
  AddScoreBody,
  ShiftResourceFetchParams,
  TentQueryParams,
} from "../schemas/shift";
import type { JSendResponse } from "../schemas/jsend";
import { TentInfoSchema, TentScoreSchema } from "../schemas/tent";
import { RequestPermissionsFail } from "../schemas/responses";

interface IFetchTentHandler extends RouteGenericInterface {
  Params: TentQueryParams;
  Reply: JSendResponse<typeof TentInfoSchema, typeof RequestPermissionsFail>;
}

export const fetchTentHandler = async (
  req: FastifyRequest<IFetchTentHandler>,
  res: FastifyReply<IFetchTentHandler>,
): Promise<never> => {
  const { shiftNr, tentNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftMember(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const currentYear = new Date().getUTCFullYear();

  const records = await prisma.record.findMany({
    where: { shiftNr, year: currentYear, tentNr, isActive: true },
    select: { child: { select: { name: true } } },
  });

  const childrenInTent = records.map((record) => record.child.name);

  const tentScores = await prisma.tentScore.findMany({
    where: { shiftNr, year: currentYear, tentNr },
    select: { score: true, createdAt: true, tentNr: true },
    orderBy: { createdAt: "asc" },
  });

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      campers: childrenInTent,
      scores: tentScores.map((score) => {
        return { ...score, createdAt: score.createdAt.toISOString() };
      }),
    }),
  );
};

export const FetchTentsData = Type.Object({
  scores: Type.Array(TentScoreSchema),
});

interface IFetchTentsHandler extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse<typeof FetchTentsData, typeof RequestPermissionsFail>;
}

export const fetchTentsHandler = async (
  req: FastifyRequest<IFetchTentsHandler>,
  res: FastifyReply<IFetchTentsHandler>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftMember(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const currentYear = new Date().getUTCFullYear();

  const tentScores = await prisma.tentScore.findMany({
    where: { shiftNr, year: currentYear },
    select: { score: true, createdAt: true, tentNr: true },
    orderBy: { createdAt: "asc" },
  });

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      scores: tentScores.map((score) => {
        return { ...score, createdAt: score.createdAt.toISOString() };
      }),
    }),
  );
};

interface IAddGradeHandler extends RouteGenericInterface {
  Params: TentQueryParams;
  Body: AddScoreBody;
  Reply: JSendResponse<typeof TentScoreSchema, typeof RequestPermissionsFail>;
}

export const addGradeHandler = async (
  req: FastifyRequest<IAddGradeHandler>,
  res: FastifyReply<IAddGradeHandler>,
): Promise<never> => {
  const { shiftNr, tentNr } = req.params;
  const { score } = req.body;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftMember(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const currentYear = new Date().getUTCFullYear();
  const result = await prisma.tentScore.create({
    data: {
      shiftNr,
      tentNr,
      year: currentYear,
      score: score,
    },
    select: { score: true, createdAt: true, tentNr: true },
  });

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      ...result,
      createdAt: result.createdAt.toISOString(),
    }),
  );
};
