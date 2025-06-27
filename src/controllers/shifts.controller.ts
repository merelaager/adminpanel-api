import fs from "fs";
import type { ReadStream } from "node:fs";
import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import prisma from "../utils/prisma";
import {
  generateShiftCamperListPDF,
  PrintEntry,
} from "../utils/shift-pdf-builder";
import { isShiftBoss, isShiftMember } from "../utils/permissions";
import {
  createErrorResponse,
  createFailResponse,
  createSuccessResponse,
} from "../utils/jsend";

import { fetchUserShiftPermissions } from "./registration/registrations.controller";

import {
  RoleNameMap,
  ShiftResourceFetchParams,
  type UserWithShiftRole,
  UserWithShiftRoleSchema,
} from "../schemas/shift";
import { CamperRecord, CamperRecordSchema } from "../schemas/user";
import { RequestPermissionsFail } from "../schemas/responses";
import type { JSendError, JSendFail, JSendResponse } from "../schemas/jsend";
import { ParentBillSchema } from "../schemas/billing";

export const FetchShiftsData = Type.Object({
  shifts: Type.Array(Type.Number()),
});

interface IFetchShiftsHandler extends RouteGenericInterface {
  Reply: JSendResponse<typeof FetchShiftsData>;
}

export const fetchShiftsHandler = async (
  _: FastifyRequest<IFetchShiftsHandler>,
  res: FastifyReply<IFetchShiftsHandler>,
): Promise<never> => {
  const shifts = await prisma.shiftInfo.findMany({
    select: { id: true },
  });

  const existingShifts = shifts.map((shift) => shift.id);
  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      shifts: existingShifts,
    }),
  );
};

export const FetchShiftPdfFailData = Type.Union([
  Type.Object({ shift: Type.String() }),
]);

interface IFetchShiftPdfHandler extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply:
    | ReadStream
    | JSendFail<typeof FetchShiftPdfFailData | typeof RequestPermissionsFail>
    | JSendError;
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
    return res.status(StatusCodes.NOT_FOUND).send(
      createFailResponse({
        shift: "Vahetust ei ole olemas või puuduvad registreeritud lapsed.",
      }),
    );
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
    return res.status(StatusCodes.FORBIDDEN).send(
      createFailResponse({
        permissions: "Puuduvad detailse nimekirja nägemise õigused.",
      }),
    );
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
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send(createErrorResponse("Viga PDFi genereerimisel."));
  }

  const stream = fs.createReadStream(filePath);
  res.status(StatusCodes.OK).type("application/pdf");
  return res.send(stream);
};

export const FetchShiftUsersData = Type.Object({
  users: Type.Array(UserWithShiftRoleSchema),
});

interface IFetchShiftUsers extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse<
    typeof FetchShiftUsersData,
    typeof RequestPermissionsFail
  >;
}

export const fetchShiftUsersHandler = async (
  req: FastifyRequest<IFetchShiftUsers>,
  res: FastifyReply<IFetchShiftUsers>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftBoss(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
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

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      users: usersWithShiftRole,
    }),
  );
};

export const FetchShiftRecordsData = Type.Object({
  records: Type.Array(CamperRecordSchema),
});

interface IFetchShiftCampers extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse<
    typeof FetchShiftRecordsData,
    typeof RequestPermissionsFail
  >;
}

export const fetchShiftRecordsHandler = async (
  req: FastifyRequest<IFetchShiftCampers>,
  res: FastifyReply<IFetchShiftCampers>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftMember(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
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
      ageAtCamp: record.ageAtCamp,
    });
  });

  return res
    .status(StatusCodes.OK)
    .send(createSuccessResponse({ records: camperRecords }));
};

export const FetchShiftEmailsData = Type.Object({
  emails: Type.Array(Type.String()),
});

interface IFetchShiftEmails extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse<
    typeof FetchShiftEmailsData,
    typeof RequestPermissionsFail
  >;
}

export const fetchShiftEmailsHandler = async (
  req: FastifyRequest<IFetchShiftEmails>,
  res: FastifyReply<IFetchShiftEmails>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftBoss(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  const data = await prisma.registration.findMany({
    where: { shiftNr, isRegistered: true },
    select: { contactEmail: true },
  });

  const emails = new Set<string>();
  data.forEach((registration) => {
    emails.add(registration.contactEmail);
  });

  return res
    .status(StatusCodes.OK)
    .send(createSuccessResponse({ emails: Array.from(emails.values()) }));
};

export const FetchShiftBillingData = Type.Object({
  records: Type.Array(ParentBillSchema),
});

interface IFetchShiftBillingInfo extends RouteGenericInterface {
  Params: ShiftResourceFetchParams;
  Reply: JSendResponse<
    typeof FetchShiftBillingData,
    typeof RequestPermissionsFail
  >;
}

export const fetchShiftBillingHandler = async (
  req: FastifyRequest<IFetchShiftBillingInfo>,
  res: FastifyReply<IFetchShiftBillingInfo>,
): Promise<never> => {
  const { shiftNr } = req.params;
  const { userId } = req.session.user;

  const isAuthorised = await isShiftBoss(userId, shiftNr);
  if (!isAuthorised) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send(createFailResponse({ permissions: "Puuduvad õigused päringuks." }));
  }

  type BillChildRecord = {
    childName: string;
    pricePaid: number;
    priceToPay: number;
    shiftNr: number;
    billSent: boolean;
  };

  // Currently, an email should be associated with (at most) one bill number.
  // Therefore, grouping by email includes bill groups as well, with the added
  // benefit of including children based on whom the bill has not been issued/updated yet.
  type EmailRecordGroup = {
    name: string;
    email: string;
    billNr: number | null;
    records: BillChildRecord[];
  };

  const rawRegistrations = await prisma.registration.findMany({
    where: { shiftNr, isRegistered: true },
    select: {
      billId: true,
      contactName: true,
      contactEmail: true,
      pricePaid: true,
      priceToPay: true,
      shiftNr: true,
      notifSent: true,
      child: {
        select: { name: true },
      },
    },
  });

  const registrationMap = new Map<string, EmailRecordGroup>();
  const relevantBillIds: number[] = [];

  rawRegistrations.forEach((registration) => {
    const data = {
      childName: registration.child.name,
      pricePaid: registration.pricePaid,
      priceToPay: registration.priceToPay,
      billNr: registration.billId,
      shiftNr: registration.shiftNr,
      billSent: registration.notifSent,
    };

    const childGroupWithoutActiveBill = registrationMap.get(
      registration.contactEmail,
    );

    if (childGroupWithoutActiveBill) {
      childGroupWithoutActiveBill.records.push(data);
      if (registration.billId)
        childGroupWithoutActiveBill.billNr = registration.billId;
    } else {
      registrationMap.set(registration.contactEmail, {
        name: registration.contactName,
        email: registration.contactEmail,
        billNr: registration.billId,
        records: [data],
      });
    }

    if (registration.billId !== null) relevantBillIds.push(registration.billId);
  });

  const addendumRegistrations = await prisma.registration.findMany({
    where: { billId: { in: relevantBillIds }, shiftNr: { not: shiftNr } },
    select: {
      billId: true,
      contactName: true,
      contactEmail: true,
      pricePaid: true,
      priceToPay: true,
      shiftNr: true,
      notifSent: true,
      child: {
        select: { name: true },
      },
    },
  });

  addendumRegistrations.forEach((registration) => {
    const childGroupWithoutActiveBill = registrationMap.get(
      registration.contactEmail,
    );
    childGroupWithoutActiveBill?.records.push({
      childName: registration.child.name,
      pricePaid: registration.pricePaid,
      priceToPay: registration.priceToPay,
      shiftNr: registration.shiftNr,
      billSent: registration.notifSent,
    });
  });

  return res.status(StatusCodes.OK).send(
    createSuccessResponse({
      records: Array.from(registrationMap.values()),
    }),
  );
};
