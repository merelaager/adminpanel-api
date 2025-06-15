import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import { fetchTeamsHandler } from "../../../controllers/teams.controller";

import { TeamRecordSchema, TeamsFetchSchema } from "../../../schemas/team";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        querystring: TeamsFetchSchema,
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: Type.Object({
              teams: Type.Array(TeamRecordSchema),
            }),
          }),
        },
      },
    },
    fetchTeamsHandler,
  );
};

export default plugin;
