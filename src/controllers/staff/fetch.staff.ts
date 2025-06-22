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
import type { ShiftStaffMember } from "../../schemas/staff";

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
  const rawShiftStaff = await prisma.shiftStaff.findMany({
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
      user: {
        select: {
          certificates: {
            where: {
              isExpired: false,
            },
            select: {
              name: true,
              certId: true,
              urlId: true,
            },
          },
        },
      },
    },
  });

  const shiftStaff: ShiftStaffMember[] = [];
  rawShiftStaff.forEach((staffMember) => {
    shiftStaff.push({
      id: staffMember.id,
      shiftNr: staffMember.shiftNr,
      year: staffMember.year,
      name: staffMember.name,
      role: staffMember.role,
      userId: staffMember.userId,
      certificates: staffMember.user?.certificates ?? [],
    });
  });

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: {
      staff: shiftStaff,
    },
  });
};
