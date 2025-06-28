import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  FetchTeamsData,
  fetchTeamsHandler,
  TeamCreationFailData,
  teamCreationHandler,
} from "../../../controllers/teams.controller";

import { TeamCreationSchema, TeamsFetchSchema } from "../../../schemas/team";
import { FailResponse, SuccessResponse } from "../../../schemas/jsend";

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
          [StatusCodes.UNPROCESSABLE_ENTITY]:
            FailResponse(TeamCreationFailData),
        },
      },
    },
    teamCreationHandler,
  );
};

export default plugin;
