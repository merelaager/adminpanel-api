import fs from "fs";
import type { ReadStream } from "node:fs";
import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";
import {
  generateShiftCamperListPDF,
  PrintEntry,
} from "../utils/shift-pdf-builder";

import { fetchUserShiftPermissions } from "./registration/registrations.controller";

import type { JSendResponse } from "../types/jsend";
import { ShiftPdfFetchParams } from "../schemas/shift";

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
  Params: ShiftPdfFetchParams;
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
