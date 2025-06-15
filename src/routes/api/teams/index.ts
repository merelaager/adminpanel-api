import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import {
  fetchTeamsHandler,
  teamCreationHandler,
} from "../../../controllers/teams.controller";

import {
  TeamCreationSchema,
  TeamRecordSchema,
  TeamsFetchSchema,
} from "../../../schemas/team";

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
  fastify.post(
    "/",
    {
      schema: {
        body: TeamCreationSchema,
        response: {
          [StatusCodes.UNPROCESSABLE_ENTITY]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({
              name: Type.String(),
            }),
          }),
        },
      },
    },
    teamCreationHandler,
  );
};

export default plugin;
