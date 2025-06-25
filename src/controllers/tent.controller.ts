import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";
import { isShiftMember } from "../utils/permissions";

import {
  AddScoreBody,
  ShiftResourceFetchParams,
  TentQueryParams,
} from "../schemas/shift";
import type { JSendResponse } from "../types/jsend";

interface IFetchTentHandler extends RouteGenericInterface {
  Params: TentQueryParams;
  Reply: JSendResponse;
}

export const fetchTentHandler = async (
  req: FastifyRequest<IFetchTentHandler>,
  res: FastifyReply<IFetchTentHandler>,
): Promise<never> => {
  const { shiftNr, tentNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftMember(userId, shiftNr);
  if (!isAuthorised) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { permissions: "Puuduvad õigused päringuks." },
    });
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

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: {
      campers: childrenInTent,
      scores: tentScores,
    },
  });
};

interface IFetchTentsHandler extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse;
}

export const fetchTentsHandler = async (
  req: FastifyRequest<IFetchTentsHandler>,
  res: FastifyReply<IFetchTentsHandler>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftMember(userId, shiftNr);
  if (!isAuthorised) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { permissions: "Puuduvad õigused päringuks." },
    });
  }

  const currentYear = new Date().getUTCFullYear();

  const tentScores = await prisma.tentScore.findMany({
    where: { shiftNr, year: currentYear },
    select: { score: true, createdAt: true, tentNr: true },
    orderBy: { createdAt: "asc" },
  });

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: {
      scores: tentScores,
    },
  });
};

interface IAddGradeHandler extends RouteGenericInterface {
  Params: TentQueryParams;
  Body: AddScoreBody;
  Reply: JSendResponse;
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
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { permissions: "Puuduvad õigused päringuks." },
    });
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

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: result,
  });
};
