import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";

import type { JSendResponse } from "../../types/jsend";
import type {
  FetchRecordsQueryString,
  FlattenedRecord,
  ForceSyncBody,
} from "../../schemas/record";

interface IForceSyncHandler extends RouteGenericInterface {
  Body: ForceSyncBody;
  Reply: JSendResponse;
}

export const forceSyncRecordsHandler = async (
  req: FastifyRequest<IForceSyncHandler>,
  res: FastifyReply<IForceSyncHandler>,
) => {
  const { shiftNr, forceSync } = req.body;

  if (!forceSync) return res.status(StatusCodes.NOT_MODIFIED).send();

  const year = new Date().getUTCFullYear();

  const registrations = await prisma.registration.findMany({
    where: { shiftNr },
    select: { childId: true, isRegistered: true },
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

interface IFetchRecordsHandler extends RouteGenericInterface {
  Querystring: FetchRecordsQueryString;
  Reply: JSendResponse;
}

export const fetchRecordsHandler = async (
  req: FastifyRequest<IFetchRecordsHandler>,
  res: FastifyReply<IFetchRecordsHandler>,
) => {
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
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { permissions: "Ligipääsuõigused puuduvad" },
    });
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
    });
  });

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: {
      records: flattenedRecords,
    },
  });
};
