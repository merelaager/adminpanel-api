import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { getSessionUser } from "#app/lib/session";
import { createFailResponse } from "#app/lib/jsend";

import { GradeDeleteSchema } from "./grades.schemas";
import { deleteGrade } from "./grades.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.delete(
    "/:gradeId",
    {
      schema: {
        params: GradeDeleteSchema,
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

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
