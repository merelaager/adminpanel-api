import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";

import { GradeDeleteParams } from "../schemas/grades";

interface IDeleteGradeHandler extends RouteGenericInterface {
  Params: GradeDeleteParams;
  Reply: never;
}

export const deleteGradeHandler = async (
  req: FastifyRequest<IDeleteGradeHandler>,
  reply: FastifyReply<IDeleteGradeHandler>,
) => {
  const { gradeId } = req.params;

  const grade = await prisma.tentScore.findUnique({
    where: { id: gradeId },
  });

  if (grade) {
    await prisma.tentScore.delete({
      where: { id: gradeId },
    });
  }

  return reply.status(StatusCodes.NO_CONTENT).send();
};
