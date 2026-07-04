import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { getSessionUser } from "#app/lib/session";
import {
  createFailResponse,
  FailResponse,
  RequestPermissionsFail,
} from "#app/lib/jsend";

import { GradeDeleteSchema } from "./grades.schemas";
import { deleteGrade } from "./grades.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.delete(
    "/:gradeId",
    {
      schema: {
        params: GradeDeleteSchema,
        response: {
          [StatusCodes.NO_CONTENT]: Type.Null(),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const isAuthorised = await deleteGrade(userId, request.params.gradeId);

      if (!isAuthorised) {
        return reply
          .status(StatusCodes.FORBIDDEN)
          .send(
            createFailResponse({ permissions: "Puuduvad õigused päringuks." }),
          );
      }

      return reply.status(StatusCodes.NO_CONTENT).send(null);
    },
  );
};

export default plugin;
