import type { FastifyBaseLogger } from "fastify";
import type { Prisma } from "#app/generated/prisma/client";

import prisma from "#app/lib/prisma";
import { getAgeAtDate } from "#app/lib/age";
import { getCurrentCampYear } from "#app/lib/camp-year";
import {
  canEditShiftBasic,
  canViewShiftBasic,
  userHasShiftPermissionInAnyOf,
} from "#app/lib/permissions";
import { Permissions } from "#app/constants/permissions";

import type {
  FlattenedRecord,
  PatchRecordBody,
  RecordsFetchQuery,
} from "./records.schemas";

export type ForceSyncResult = "not-modified" | "shift-not-found" | "synced";

export const forceSyncRecords = async (
  shiftNr: number,
  forceSync: boolean,
): Promise<ForceSyncResult> => {
  if (!forceSync) return "not-modified";

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
    return "shift-not-found";
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

  return "synced";
};

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

// Returns null when the user is not authorised to view the shift's records.
const fetchShiftRecords = async (
  shiftNr: number,
  userId: number,
  log: FastifyBaseLogger,
): Promise<FlattenedRecord[] | null> => {
  if (!(await canViewShiftBasic(userId, shiftNr))) {
    log.warn({ userId, shiftNr }, "User not authorised to view shift records");
    return null;
  }

  const records = await prisma.record.findMany({
    where: { shiftNr, year: getCurrentCampYear(), isActive: true },
    include: recordRelations,
  });

  return records.map(flattenRecord);
};

// Returns null when the user is not authorised to view the camper's records.
const fetchCamperRecords = async (
  childId: number,
  userId: number,
  log: FastifyBaseLogger,
): Promise<FlattenedRecord[] | null> => {
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
    log.warn({ userId, childId }, "User not authorised to view historic records");
    return null;
  }

  const records = await prisma.record.findMany({
    where: { childId, isActive: true },
    include: recordRelations,
    orderBy: [{ year: "desc" }, { shiftNr: "asc" }],
  });

  return records.map(flattenRecord);
};

export const fetchRecordsForQuery = async (
  query: RecordsFetchQuery,
  userId: number,
  log: FastifyBaseLogger,
): Promise<FlattenedRecord[] | null> => {
  if ("childId" in query) {
    return fetchCamperRecords(query.childId, userId, log);
  }
  return fetchShiftRecords(query.shiftNr, userId, log);
};

export type PatchRecordResult =
  | "record-not-found"
  | "forbidden"
  | "team-not-found"
  | "ok";

export const patchRecord = async (
  userId: number,
  recordId: number,
  patchData: PatchRecordBody,
): Promise<PatchRecordResult> => {
  const record = await prisma.record.findUnique({
    where: { id: recordId },
    select: { shiftNr: true },
  });

  if (record === null) return "record-not-found";

  const isAuthorised = await canEditShiftBasic(userId, record.shiftNr);
  if (!isAuthorised) return "forbidden";

  const teamId = patchData.teamId;
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
    if (team === null) return "team-not-found";
  }

  await prisma.record.update({
    where: { id: recordId },
    data: patchData,
  });

  return "ok";
};
