import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import prisma from "../utils/prisma";
import { createFailResponse, createSuccessResponse } from "../utils/jsend";

import {
  FetchTeamsQueryString,
  TeamCreationBody,
  TeamRecord,
  TeamRecordSchema,
} from "../schemas/team";
import type { JSendFail, JSendResponse } from "../schemas/jsend";

export const FetchTeamsData = Type.Object({
  teams: Type.Array(TeamRecordSchema),
});

interface IFetchTeamsHandler extends RouteGenericInterface {
  Querystring: FetchTeamsQueryString;
  Reply: JSendResponse<typeof FetchTeamsData>;
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

  return res.status(StatusCodes.OK).send(createSuccessResponse({ teams }));
};

export const TeamCreationFailData = Type.Object({
  name: Type.String(),
});

interface ITeamCreationHandler extends RouteGenericInterface {
  Body: TeamCreationBody;
  Reply: JSendFail<typeof TeamCreationFailData>;
}

export const teamCreationHandler = async (
  req: FastifyRequest<ITeamCreationHandler>,
  res: FastifyReply<ITeamCreationHandler>,
): Promise<never> => {
  const { shiftNr, name } = req.body;
  const year = new Date().getUTCFullYear();

  if (name.length < 1) {
    return res.status(StatusCodes.UNPROCESSABLE_ENTITY).send(
      createFailResponse({
        name: "Meeskonna nimi ei tohi olla tühi",
      }),
    );
  }

  await prisma.team.create({
    data: { shiftNr, name, year },
  });

  return res.status(StatusCodes.CREATED).send();
};
