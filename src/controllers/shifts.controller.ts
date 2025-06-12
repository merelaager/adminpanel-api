import fs from "fs";
import type { ReadStream } from "node:fs";
import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";
import {
  generateShiftCamperListPDF,
  PrintEntry,
} from "../utils/shift-pdf-builder";
import { isShiftBoss, isShiftMember } from "../utils/permissions";

import { fetchUserShiftPermissions } from "./registration/registrations.controller";

import type { JSendResponse } from "../types/jsend";
import {
  RoleNameMap,
  ShiftResourceFetchParams,
  type UserWithShiftRole,
} from "../schemas/shift";
import type { CamperRecord } from "../schemas/user";

interface IFetchShiftsHandler extends RouteGenericInterface {
  Reply: JSendResponse;
}

export const fetchShiftsHandler = async (
  _: FastifyRequest<IFetchShiftsHandler>,
  res: FastifyReply<IFetchShiftsHandler>,
): Promise<never> => {
  const shifts = await prisma.shiftInfo.findMany({
    select: { id: true },
  });

  const existingShifts = shifts.map((shift) => shift.id);
  return res.status(StatusCodes.OK).send({
    status: "success",
    data: {
      shifts: existingShifts,
    },
  });
};

interface IFetchShiftPdfHandler extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse | ReadStream;
}

export const fetchShiftPdfHandler = async (
  req: FastifyRequest<IFetchShiftPdfHandler>,
  res: FastifyReply<IFetchShiftPdfHandler>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const activeRegistrations = await prisma.registration.findMany({
    where: { shiftNr, isRegistered: true },
    include: { child: { select: { name: true, sex: true } } },
    orderBy: {
      child: {
        name: "asc",
      },
    },
  });

  if (activeRegistrations.length === 0) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        shift: "Vahetust ei ole olemas või puuduvad registreeritud lapsed.",
      },
    });
  }

  const shiftViewPermissions = await fetchUserShiftPermissions(
    userId,
    shiftNr,
    "registration.view",
  );

  const canViewPII =
    shiftViewPermissions.has("registration.view.full") ||
    shiftViewPermissions.has("registration.view.personal-info");
  const canViewContact =
    shiftViewPermissions.has("registration.view.full") ||
    shiftViewPermissions.has("registration.view.contact");

  const canPrint = canViewPII && canViewContact;
  if (!canPrint) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: {
        permissions: "Puuduvad detailse nimekirja nägemise õigused.",
      },
    });
  }

  const printEntries: PrintEntry[] = [];
  activeRegistrations.forEach((registration) => {
    printEntries.push({
      name: registration.child.name,
      sex: registration.child.sex,
      dob: registration.birthday,
      old: registration.isOld,
      shirtSize: registration.tsSize,
      contactName: registration.contactName,
      contactEmail: registration.contactEmail,
      contactNumber: registration.contactNumber,
    });
  });

  const filePath = await generateShiftCamperListPDF(shiftNr, printEntries);
  if (!filePath) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Viga PDFi genereerimisel.",
    });
  }

  const stream = fs.createReadStream(filePath);
  res.status(StatusCodes.OK).type("application/pdf");
  return res.send(stream);
};

interface IFetchShiftUsers extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse;
}

export const fetchShiftUsersHandler = async (
  req: FastifyRequest<IFetchShiftUsers>,
  res: FastifyReply<IFetchShiftUsers>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftBoss(userId, shiftNr);
  if (!isAuthorised) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { permissions: "Puuduvad õigused päringuks." },
    });
  }

  const rawUsersAndPermissions = await prisma.userRoles.findMany({
    where: { shiftNr },
    select: {
      role: {
        select: {
          roleName: true,
          id: true,
          role_permissions: {
            select: { permission: { select: { permissionName: true } } },
          },
        },
      },
      user: { select: { name: true, id: true } },
    },
  });

  const usersWithShiftRole: UserWithShiftRole[] = [];
  rawUsersAndPermissions.forEach((obj) => {
    usersWithShiftRole.push({
      userId: obj.user.id,
      name: obj.user.name,
      shiftNr,
      role: RoleNameMap[obj.role.roleName] ?? obj.role.roleName,
      roleId: obj.role.id,
    });
  });

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: {
      users: usersWithShiftRole,
    },
  });
};

interface IFetchShiftCampers extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse;
}

export const fetchShiftCampersHandler = async (
  req: FastifyRequest<IFetchShiftCampers>,
  res: FastifyReply<IFetchShiftCampers>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftMember(userId, shiftNr);
  if (!isAuthorised) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: { permissions: "Puuduvad õigused päringuks." },
    });
  }

  const currentYear = new Date().getUTCFullYear();

  const rawRecords = await prisma.record.findMany({
    where: { shiftNr, year: currentYear, isActive: true },
    include: {
      child: {
        select: { name: true, sex: true },
      },
    },
    omit: { createdAt: true, updatedAt: true, isActive: true },
  });

  const camperRecords: CamperRecord[] = [];
  rawRecords.forEach((record) => {
    camperRecords.push({
      id: record.id,
      childId: record.childId,
      childName: record.child.name,
      childSex: record.child.sex,
      shiftNr: record.shiftNr,
      year: record.year,
      tentNr: record.tentNr,
      teamId: record.teamId,
      isPresent: record.isPresent,
    });
  });

  return res.status(StatusCodes.OK).send({
    status: "success",
    data: { records: camperRecords },
  });
};
