import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import type { Prisma } from "#app/generated/prisma/client";
import prisma from "#app/lib/prisma";
import { getAgeAtDate } from "#app/lib/age";
import { getCurrentCampYear } from "#app/lib/camp-year";
import {
  canEditShiftBasic,
  canViewShiftBasic,
  userHasShiftPermissionInAnyOf,
} from "#app/lib/permissions";
import { getSessionUser } from "#app/lib/session";
import { createFailResponse, createSuccessResponse } from "#app/lib/jsend";
import { Permissions } from "#app/constants/permissions";

import {
  FlattenedRecord,
  FlattenedRecordSchema,
  ForceSyncSchema,
  RecordsFetchSchema,
} from "#app/schemas/record";
import { RequestPermissionsFail } from "#app/lib/jsend";
import type { JSendResponse } from "#app/lib/jsend";
import type { Route } from "#app/schemas/route";

type IForceSyncHandler = Route<{ body: typeof ForceSyncSchema }> & {
  Reply: void;
};

export const forceSyncRecordsHandler = async (
  req: FastifyRequest<IForceSyncHandler>,
  res: FastifyReply<IForceSyncHandler>,
): Promise<never> => {
  const { userId } = getSessionUser(req);
  const { shiftNr, forceSync } = req.body;

  const isAuthorised = await canEditShiftBasic(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  if (!forceSync) return res.status(StatusCodes.NOT_MODIFIED).send();

  const year = getCurrentCampYear();

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

type IFetchRecordsHandler = Route<{
  querystring: typeof RecordsFetchSchema;
}> & {
  Reply: JSendResponse<typeof FetchRecordsData, typeof RequestPermissionsFail>;
};

type FetchRecordsReply = FastifyReply<IFetchRecordsHandler>;

const recordRelations = {
  child: { select: { name: true } },
  team: { select: { name: true } },
} satisfies Prisma.RecordInclude;

type RecordWithRelations = Prisma.RecordGetPayload<{
  include: typeof recordRelations;
}>;

const flattenRecord = (record: RecordWithRelations): FlattenedRecord => ({
  id: record.id,
  childId: record.childId,
  childName: record.child.name,
  teamId: record.teamId,
  teamName: record.team?.name ?? null,
  tentNr: record.tentNr,
  isPresent: record.isPresent,
  ageAtCamp: record.ageAtCamp,
  year: record.year,
  shiftNr: record.shiftNr,
});

const fetchShiftRecords = async (
  shiftNr: number,
  userId: number,
  res: FetchRecordsReply,
): Promise<never> => {
  if (!(await canViewShiftBasic(userId, shiftNr))) {
    res.log.warn(
      { userId, shiftNr },
      "User not authorised to view shift records",
    );
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Ligipääsuõigused puuduvad" }));
  }

  const records = await prisma.record.findMany({
    where: { shiftNr, year: getCurrentCampYear(), isActive: true },
    include: recordRelations,
  });

  return res
    .status(StatusCodes.OK)
    .send(createSuccessResponse({ records: records.map(flattenRecord) }));
};

const fetchCamperRecords = async (
  childId: number,
  userId: number,
  res: FetchRecordsReply,
): Promise<never> => {
  const registrations = await prisma.registration.findMany({
    where: { childId },
    select: { shiftNr: true },
  });

  const isAuthorised = await userHasShiftPermissionInAnyOf(
    userId,
    registrations.map((registration) => registration.shiftNr),
    Permissions.VIEW_SHIFT_BASIC,
  );

  if (!isAuthorised) {
    res.log.warn(
      { userId, childId },
      "User not authorised to view historic records",
    );
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Ligipääsuõigused puuduvad" }));
  }

  const records = await prisma.record.findMany({
    where: { childId, isActive: true },
    include: recordRelations,
    orderBy: [{ year: "desc" }, { shiftNr: "asc" }],
  });

  return res
    .status(StatusCodes.OK)
    .send(createSuccessResponse({ records: records.map(flattenRecord) }));
};

export const fetchRecordsHandler = async (
  req: FastifyRequest<IFetchRecordsHandler>,
  res: FastifyReply<IFetchRecordsHandler>,
): Promise<never> => {
  const { userId } = getSessionUser(req);

  if ("childId" in req.query) {
    return fetchCamperRecords(req.query.childId, userId, res);
  }
  return fetchShiftRecords(req.query.shiftNr, userId, res);
};
