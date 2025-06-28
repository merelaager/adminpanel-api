import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import type { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { getAgeAtDate } from "../../utils/age";
import { createFailResponse, createSuccessResponse } from "../../utils/jsend";

import {
  FetchRecordsQueryString,
  FlattenedRecord,
  FlattenedRecordSchema,
  ForceSyncBody,
} from "../../schemas/record";
import { RequestPermissionsFail } from "../../schemas/responses";
import type { JSendResponse } from "../../schemas/jsend";

interface IForceSyncHandler extends RouteGenericInterface {
  Body: ForceSyncBody;
  Reply: void;
}

export const forceSyncRecordsHandler = async (
  req: FastifyRequest<IForceSyncHandler>,
  res: FastifyReply<IForceSyncHandler>,
): Promise<never> => {
  const { shiftNr, forceSync } = req.body;

  if (!forceSync) return res.status(StatusCodes.NOT_MODIFIED).send();

  const year = new Date().getUTCFullYear();

  const registrations = await prisma.registration.findMany({
    where: { shiftNr },
    select: { childId: true, isRegistered: true, birthday: true },
    orderBy: [{ childId: "asc" }],
  });

  const records = await prisma.record.findMany({
    where: { shiftNr, year },
    select: { id: true, childId: true, isActive: true },
    orderBy: [{ childId: "asc" }],
  });

  // Use a map to store the unique entries of children to record.
  // The records must be unique due to the database constraint.
  // A Set does not work since shallowly identical objects are not the same object.
  const childrenToRecord = new Map<number, Prisma.RecordCreateManyInput>();

  const recordsToActivate: number[] = [];
  const recordsToDeactivate: number[] = [];

  const shiftInfo = await prisma.shiftInfo.findUnique({
    where: { id: shiftNr },
    select: { startDate: true },
  });

  if (!shiftInfo) {
    return res.status(StatusCodes.NOT_FOUND).send();
  }

  const shiftStartDate = shiftInfo.startDate;

  registrations.forEach((registration) => {
    const record = records.find(
      (record) => record.childId === registration.childId,
    );

    // A record exists but is out of sync with the registrations.
    if (record && record.isActive !== registration.isRegistered) {
      if (record.isActive) recordsToDeactivate.push(record.id);
      else recordsToActivate.push(record.id);
    }

    // No shift record exists but should, as the camper is registered.
    if (!record && registration.isRegistered) {
      childrenToRecord.set(registration.childId, {
        childId: registration.childId,
        shiftNr,
        year,
        ageAtCamp: getAgeAtDate(registration.birthday, shiftStartDate),
      });
    }
  });

  if (childrenToRecord.size > 0) {
    await prisma.record.createMany({
      data: Array.from(childrenToRecord.values()),
    });
  }

  if (recordsToActivate.length > 0) {
    await prisma.record.updateMany({
      where: { id: { in: recordsToActivate } },
      data: { isActive: true },
    });
  }

  if (recordsToDeactivate.length > 0) {
    await prisma.record.updateMany({
      where: { id: { in: recordsToDeactivate } },
      data: { isActive: false },
    });
  }

  return res.status(StatusCodes.NO_CONTENT).send();
};

export const FetchRecordsData = Type.Object({
  records: Type.Array(FlattenedRecordSchema),
});

interface IFetchRecordsHandler extends RouteGenericInterface {
  Querystring: FetchRecordsQueryString;
  Reply: JSendResponse<typeof FetchRecordsData, typeof RequestPermissionsFail>;
}

export const fetchRecordsHandler = async (
  req: FastifyRequest<IFetchRecordsHandler>,
  res: FastifyReply<IFetchRecordsHandler>,
): Promise<never> => {
  const { shiftNr } = req.query;
  const { userId } = req.session.user;

  // Verify that the user has any kind of permission for that shift.
  // There is no sensitive data here, so any person registered to the shift
  // should be able to see the information.
  const permissions = await prisma.userRoles.findMany({
    where: { shiftNr, userId },
  });

  if (permissions.length === 0) {
    console.log(
      `User '${userId}' does not have any permissions for shift '${shiftNr}'`,
    );
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Ligipääsuõigused puuduvad" }));
  }

  const records = await prisma.record.findMany({
    where: {
      shiftNr,
      year: new Date().getUTCFullYear(),
      isActive: true,
    },
    include: {
      child: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  const flattenedRecords: FlattenedRecord[] = [];

  records.forEach((record) => {
    flattenedRecords.push({
      id: record.id,
      childId: record.childId,
      childName: record.child.name,
      teamId: record.teamId,
      teamName: record.team?.name ?? null,
      tentNr: record.tentNr,
      isPresent: record.isPresent,
      ageAtCamp: record.ageAtCamp,
    });
  });

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      records: flattenedRecords,
    }),
  );
};
