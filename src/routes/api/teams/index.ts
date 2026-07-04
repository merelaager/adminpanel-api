import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { requireShiftPermission } from "#app/lib/guards";
import { Permissions } from "#app/constants/permissions";
import {
  createSuccessResponse,
  FailResponse,
  RequestPermissionsFail,
  SuccessResponse,
} from "#app/lib/jsend";

import {
  FetchTeamsData,
  TeamCreationSchema,
  TeamsFetchSchema,
} from "./teams.schemas";
import { createTeam, fetchTeams } from "./teams.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      preHandler: requireShiftPermission(Permissions.VIEW_SHIFT_BASIC, "query"),
      schema: {
        querystring: TeamsFetchSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchTeamsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const teams = await fetchTeams(request.query.shiftNr);
      return reply.status(StatusCodes.OK).send(createSuccessResponse({ teams }));
    },
  );

  fastify.post(
    "/",
    {
      preHandler: requireShiftPermission(Permissions.EDIT_SHIFT_BASIC, "body"),
      schema: {
        body: TeamCreationSchema,
        response: {
          [StatusCodes.CREATED]: Type.Null(),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const { shiftNr, name } = request.body;
      await createTeam(shiftNr, name);
      return reply.status(StatusCodes.CREATED).send(null);
    },
  );
};

export default plugin;
