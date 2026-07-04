import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import prisma from "#app/lib/prisma";
import { canEditShiftBasic } from "#app/lib/permissions";
import { getSessionUser } from "#app/lib/session";
import { getCurrentCampYear } from "#app/lib/camp-year";

import { PatchRecordSchema, RecordParamsSchema } from "#app/schemas/record";
import { RequestPermissionsFail } from "#app/lib/jsend";
import type { JSendFail } from "#app/lib/jsend";
import { createFailResponse } from "#app/lib/jsend";
import type { Route } from "#app/schemas/route";

export const PatchRecordFailDataNF = Type.Object({
  recordId: Type.String(),
});

export const PatchRecordFailDataUE = Type.Object({ teamId: Type.String() });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PatchRecordFailData = Type.Union([
  PatchRecordFailDataNF,
  PatchRecordFailDataUE,
  RequestPermissionsFail,
]);

type IPatchRecord = Route<{
  params: typeof RecordParamsSchema;
  body: typeof PatchRecordSchema;
}> & {
  Reply: JSendFail<typeof PatchRecordFailData> | null;
};

export const patchRecordHandler = async (
  req: FastifyRequest<IPatchRecord>,
  res: FastifyReply<IPatchRecord>,
): Promise<never> => {
  const { recordId } = req.params;
  const { userId } = getSessionUser(req);

  const record = await prisma.record.findUnique({
    where: { id: recordId },
    select: { shiftNr: true },
  });

  if (record === null) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .send(
        createFailResponse({ recordId: `Kirjet ei leitud. (id: ${recordId})` }),
      );
  }

  const isAuthorised = await canEditShiftBasic(userId, record.shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const teamId = req.body.teamId;
  if (teamId !== undefined && teamId !== null) {
    // Only allow hooking to teams of current year and shift.
    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        shiftNr: record.shiftNr,
        year: getCurrentCampYear(),
      },
      select: { id: true },
    });
    if (team === null) {
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).send(
        createFailResponse({
          teamId: `Meeskonda ei leitud või see ei kuulu vahetusse. (id: ${teamId})`,
        }),
      );
    }
  }

  await prisma.record.update({
    where: { id: recordId },
    data: req.body,
  });

  return res.status(StatusCodes.NO_CONTENT).send(null);
};
