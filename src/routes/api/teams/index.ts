import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  FetchTeamsData,
  fetchTeamsHandler,
  TeamCreationFailData,
  teamCreationHandler,
} from "#app/controllers/teams.controller";

import { TeamCreationSchema, TeamsFetchSchema } from "#app/schemas/team";
import { FailResponse, SuccessResponse } from "#app/lib/jsend";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        querystring: TeamsFetchSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchTeamsData),
        },
      },
    },
    fetchTeamsHandler,
  );
  fastify.post(
    "/",
    {
      schema: {
        body: TeamCreationSchema,
        response: {
          [StatusCodes.BAD_REQUEST]: FailResponse(TeamCreationFailData),
        },
      },
    },
    teamCreationHandler,
  );
};

export default plugin;
