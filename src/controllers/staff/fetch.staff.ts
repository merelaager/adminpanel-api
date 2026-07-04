import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import prisma from "#app/lib/prisma";
import { canViewShiftStaff } from "#app/lib/permissions";
import { getSessionUser } from "#app/lib/session";
import { createFailResponse, createSuccessResponse } from "#app/lib/jsend";
import { getCurrentCampYear } from "#app/lib/camp-year";

import { ShiftResourceFetchParams } from "#app/schemas/shift";
import { ShiftStaffMember, ShiftStaffSchema } from "#app/schemas/staff";
import type { JSendResponse } from "#app/lib/jsend";
import { RequestPermissionsFail } from "#app/lib/jsend";
import type { Route } from "#app/schemas/route";

export const FetchShiftStaffData = Type.Object({
  staff: Type.Array(ShiftStaffSchema),
});

type IFetchShiftStaff = Route<{ params: typeof ShiftResourceFetchParams }> & {
  Reply: JSendResponse<
    typeof FetchShiftStaffData,
    typeof RequestPermissionsFail
  >;
};

export const fetchShiftStaff = async (
  req: FastifyRequest<IFetchShiftStaff>,
  res: FastifyReply<IFetchShiftStaff>,
): Promise<never> => {
  const { userId } = getSessionUser(req);
  const { shiftNr } = req.params;

  const isAuthorised = await canViewShiftStaff(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const currentYear = getCurrentCampYear();
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

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      staff: shiftStaff,
    }),
  );
};
