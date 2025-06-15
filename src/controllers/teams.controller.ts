import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";

import type { JSendResponse } from "../types/jsend";
import type { FetchTeamsQueryString, TeamRecord } from "../schemas/team";

interface IFetchTeamsHandler extends RouteGenericInterface {
  Querystring: FetchTeamsQueryString;
  Reply: JSendResponse;
}

export const fetchTeamsHandler = async (
  req: FastifyRequest<IFetchTeamsHandler>,
  res: FastifyReply<IFetchTeamsHandler>,
): Promise<never> => {
  const { shiftNr } = req.query;

  const teams: TeamRecord[] = await prisma.team.findMany({
    where: { shiftNr, year: new Date().getUTCFullYear() },
    select: {
      id: true,
      shiftNr: true,
      name: true,
      year: true,
      place: true,
      captainId: true,
    },
  });

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: { teams },
  });
};
