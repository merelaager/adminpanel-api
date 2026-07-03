import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";

import { GradeDeleteParams } from "../schemas/grades";
import { isShiftMember } from "../utils/permissions";
import { createFailResponse } from "../utils/jsend";
import { getSessionUser } from "../utils/session";

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
    const isAuthorised = await isShiftMember(userId, grade.shiftNr);
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
