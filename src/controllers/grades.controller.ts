import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "#app/utils/prisma";

import { GradeDeleteParams } from "#app/schemas/grades";
import { canEditShiftBasic } from "#app/utils/permissions";
import { createFailResponse } from "#app/utils/jsend";
import { getSessionUser } from "#app/utils/session";

interface IDeleteGradeHandler extends RouteGenericInterface {
  Params: GradeDeleteParams;
  Reply: never;
}

export const deleteGradeHandler = async (
  req: FastifyRequest<IDeleteGradeHandler>,
  reply: FastifyReply<IDeleteGradeHandler>,
) => {
  const { userId } = getSessionUser(req);
  const { gradeId } = req.params;

  const grade = await prisma.tentScore.findUnique({
    where: { id: gradeId },
  });

  if (grade) {
    const isAuthorised = await canEditShiftBasic(userId, grade.shiftNr);
    if (!isAuthorised) {
      return reply
        .status(StatusCodes.FORBIDDEN)
        .send(
          createFailResponse({ permissions: "Puuduvad õigused päringuks." }),
        );
    }

    await prisma.tentScore.delete({
      where: { id: gradeId },
    });
  }

  return reply.status(StatusCodes.NO_CONTENT).send();
};
