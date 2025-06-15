import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";

import type { JSendResponse } from "../types/jsend";
import type {
  FetchTeamsQueryString,
  TeamCreationBody,
  TeamRecord,
} from "../schemas/team";

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

interface ITeamCreationHandler extends RouteGenericInterface {
  Body: TeamCreationBody;
  Reply: JSendResponse | void;
}

export const teamCreationHandler = async (
  req: FastifyRequest<ITeamCreationHandler>,
  res: FastifyReply<ITeamCreationHandler>,
): Promise<never> => {
  const { shiftNr, name } = req.body;
  const year = new Date().getUTCFullYear();

  if (name.length < 1) {
    return res.status(StatusCodes.UNPROCESSABLE_ENTITY).send({
      status: "fail",
      data: {
        name: "Meeskonna nimi ei tohi olla tühi",
      },
    });
  }

  await prisma.team.create({
    data: { shiftNr, name, year },
  });

  return res.status(StatusCodes.CREATED).send();
};
