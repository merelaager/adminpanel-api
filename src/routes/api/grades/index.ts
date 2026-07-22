import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { getSessionUser } from "#app/lib/session";
import {
  createFailResponse,
  FailResponse,
  RequestPermissionsFail,
} from "#app/lib/jsend";

import {
  GradeParamsSchema,
  PatchGradeFailDataNF,
  PatchGradeSchema,
} from "./grades.schemas";
import { deleteGrade, patchGrade } from "./grades.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.delete(
    "/:gradeId",
    {
      schema: {
        params: GradeParamsSchema,
        response: {
          [StatusCodes.NO_CONTENT]: {},
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

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );

  fastify.patch(
    "/:gradeId",
    {
      schema: {
        params: GradeParamsSchema,
        body: PatchGradeSchema,
        response: {
          [StatusCodes.NO_CONTENT]: {},
          [StatusCodes.NOT_FOUND]: FailResponse(PatchGradeFailDataNF),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const { gradeId } = request.params;
      const { userId } = getSessionUser(request);

      const result = await patchGrade(userId, gradeId, request.body.score);

      if (result === "not-found") {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            gradeId: `Hinnet ei leitud. (id: ${gradeId})`,
          }),
        );
      }

      if (result === "forbidden") {
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
