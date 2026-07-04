import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "#app/lib/prisma";

import { GradeDeleteSchema } from "#app/schemas/grades";
import { canEditShiftBasic } from "#app/lib/permissions";
import { createFailResponse } from "#app/lib/jsend";
import { getSessionUser } from "#app/lib/session";
import type { Route } from "#app/schemas/route";

type IDeleteGradeHandler = Route<{ params: typeof GradeDeleteSchema }> & {
  Reply: never;
};

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

    // Use deleteMany to prevent potential rate with regular delete.
    await prisma.tentScore.deleteMany({
      where: { id: gradeId },
    });
  }

  return reply.status(StatusCodes.NO_CONTENT).send();
};
