import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";
import { isShiftMember } from "../utils/permissions";

import type { TentFetchParams } from "../schemas/shift";
import type { JSendResponse } from "../types/jsend";

interface IFetchTentHandler extends RouteGenericInterface {
  Params: TentFetchParams;
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
    where: { shiftNr, year: currentYear },
    select: { score: true, createdAt: true },
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
