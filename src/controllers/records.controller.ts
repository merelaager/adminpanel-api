import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import prisma from "../utils/prisma";
import { isShiftMember } from "../utils/permissions";
import { getChildAgeAtShiftStart } from "../utils/age";

import type { PatchRecordBody, RecordParams } from "../schemas/record";
import { RequestPermissionsFail } from "../schemas/responses";
import type { JSendFail } from "../schemas/jsend";
import { createFailResponse } from "../utils/jsend";

type RecordCreateData = {
  childId: number;
  shiftNr: number;
};

export const toggleRecord = async (
  recordBasis: RecordCreateData,
  isRegistered: boolean,
) => {
  const { childId, shiftNr } = recordBasis;
  const currentYear = new Date().getFullYear();

  // If the record exists, toggle it on/off.
  // Else, create the record, e.g. when the registration is first approved.
  await prisma.record.upsert({
    where: {
      metaId: {
        childId,
        shiftNr,
        year: currentYear,
      },
    },
    update: {
      isActive: isRegistered,
    },
    create: {
      childId,
      shiftNr,
      year: currentYear,
      ageAtCamp: await getChildAgeAtShiftStart(childId, shiftNr),
    },
  });
};

export const PatchRecordFailDataNF = Type.Object({
  recordId: Type.String(),
});

export const PatchRecordFailDataUE = Type.Union([
  Type.Object({ tentNr: Type.String() }),
  Type.Object({ teamId: Type.String() }),
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PatchRecordFailData = Type.Union([
  PatchRecordFailDataNF,
  PatchRecordFailDataUE,
  RequestPermissionsFail,
]);

interface IPatchRecord extends RouteGenericInterface {
  Params: RecordParams;
  Body: PatchRecordBody;
  Reply: JSendFail<typeof PatchRecordFailData>;
}

export const patchRecordHandler = async (
  req: FastifyRequest<IPatchRecord>,
  res: FastifyReply<IPatchRecord>,
): Promise<never> => {
  const { recordId } = req.params;
  const { userId } = req.session.user;

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

  const isAuthorised = await isShiftMember(userId, record.shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const tentNr = req.body.tentNr;
  if (tentNr !== undefined && tentNr !== null) {
    if (tentNr < 1 || tentNr > 10) {
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).send(
        createFailResponse({
          tentNr: `Telk peab olema vahemikus 1–10. (oli: ${tentNr})`,
        }),
      );
    }
  }

  const teamId = req.body.teamId;
  if (teamId !== undefined && teamId !== null) {
    // Only allow hooking to teams of current year and shift.
    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        shiftNr: record.shiftNr,
        year: new Date().getUTCFullYear(),
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

  return res.status(StatusCodes.NO_CONTENT).send();
};
