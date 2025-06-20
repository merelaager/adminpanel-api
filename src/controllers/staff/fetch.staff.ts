import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../../utils/prisma";
import { canViewShiftStaff } from "../../utils/permissions";

import { ShiftResourceFetchParams } from "../../schemas/shift";
import type { JSendResponse } from "../../types/jsend";

interface IFetchShiftStaff extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse;
}

export const fetchShiftStaff = async (
  req: FastifyRequest<IFetchShiftStaff>,
  res: FastifyReply<IFetchShiftStaff>,
): Promise<never> => {
  const { userId } = req.session.user;
  const { shiftNr } = req.params;

  const isAuthorised = await canViewShiftStaff(userId, shiftNr);
  if (!isAuthorised) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { permissions: "Puuduvad õigused päringuks." },
    });
  }

  const currentYear = new Date().getUTCFullYear();
  const shiftStaff = await prisma.shiftStaff.findMany({
    where: { year: currentYear, shiftNr },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      shiftNr: true,
      year: true,
      name: true,
      role: true,
      userId: true,
    },
  });

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: {
      staff: shiftStaff,
    },
  });
};
