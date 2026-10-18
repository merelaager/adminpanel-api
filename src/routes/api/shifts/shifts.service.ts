import type { Prisma } from "#app/generated/prisma/client";
import prisma from "#app/lib/prisma";
import { getCurrentCampYear } from "#app/lib/camp-year";
import { getRoleDisplayName } from "#app/constants/roles";
import { PrintEntry } from "#app/services/shift-pdf.service";

import type {
  CamperRecord,
  ParentBillData,
  ShiftStaffMember,
  TentInfo,
  UserWithShiftRole,
} from "./shifts.schemas";

export const fetchShifts = async (): Promise<number[]> => {
  const shifts = await prisma.shiftInfo.findMany({
    select: { id: true },
  });

  return shifts.map((shift) => shift.id);
};

export const fetchShiftPrintEntries = async (
  shiftNr: number,
): Promise<PrintEntry[]> => {
  const activeRegistrations = await prisma.registration.findMany({
    where: { shiftNr, isRegistered: true },
    include: { child: { select: { name: true, sex: true } } },
    orderBy: {
      child: {
        name: "asc",
      },
    },
  });

  return activeRegistrations.map((registration) => ({
    name: registration.child.name,
    sex: registration.child.sex,
    dob: registration.birthday,
    old: registration.isOld,
    shirtSize: registration.tsSize,
    contactName: registration.contactName,
    contactEmail: registration.contactEmail,
    contactNumber: registration.contactNumber,
  }));
};

export const fetchShiftUsers = async (
  shiftNr: number,
): Promise<UserWithShiftRole[]> => {
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

  return rawUsersAndPermissions.map((entry) => ({
    userId: entry.user.id,
    name: entry.user.name,
    shiftNr,
    role: getRoleDisplayName(entry.role.roleName),
    roleId: entry.role.id,
  }));
};

export const fetchShiftRecords = async (
  shiftNr: number,
): Promise<CamperRecord[]> => {
  const currentYear = getCurrentCampYear();

  const rawRecords = await prisma.record.findMany({
    where: { shiftNr, year: currentYear, isActive: true },
    include: {
      child: {
        select: { name: true, sex: true },
      },
    },
    omit: { createdAt: true, updatedAt: true, isActive: true },
  });

  return rawRecords.map((record) => ({
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
  }));
};

export const fetchShiftEmails = async (shiftNr: number): Promise<string[]> => {
  const data = await prisma.registration.findMany({
    where: { shiftNr, isRegistered: true },
    select: { contactEmail: true },
  });

  const emails = new Set<string>();
  data.forEach((registration) => {
    emails.add(registration.contactEmail);
  });

  return Array.from(emails.values());
};

const billingRegistrationSelect = {
  contactName: true,
  contactEmail: true,
  pricePaid: true,
  priceToPay: true,
  shiftNr: true,
  child: { select: { name: true } },
  billItem: {
    select: { bill: { select: { id: true, number: true, sentAt: true } } },
  },
} satisfies Prisma.RegistrationSelect;

export const fetchShiftBilling = async (
  shiftNr: number,
): Promise<ParentBillData[]> => {
  const registrations = await prisma.registration.findMany({
    where: { shiftNr, isRegistered: true },
    select: billingRegistrationSelect,
  });

  const billIds = registrations
    .map((r) => r.billItem?.bill.id)
    .filter((id) => id !== undefined);
  const sameBillRegistrations = await prisma.registration.findMany({
    where: {
      shiftNr: { not: shiftNr },
      billItem: { billId: { in: billIds } },
    },
    select: billingRegistrationSelect,
  });

  const parents = new Map<string, ParentBillData>();
  for (const registration of [...registrations, ...sameBillRegistrations]) {
    const bill = registration.billItem?.bill ?? null;
    let parent = parents.get(registration.contactEmail);
    if (!parent) {
      parent = {
        name: registration.contactName,
        email: registration.contactEmail,
        billNr: null,
        records: [],
      };
      parents.set(registration.contactEmail, parent);
    }

    if (bill && (parent.billNr === null || bill.number > parent.billNr)) {
      parent.billNr = bill.number;
    }
    parent.records.push({
      childName: registration.child.name,
      pricePaid: registration.pricePaid,
      priceToPay: registration.priceToPay,
      shiftNr: registration.shiftNr,
      billNr: bill?.number ?? null,
      billSent: bill?.sentAt != null,
    });
  }

  return [...parents.values()];
};

export const fetchShiftStaff = async (
  shiftNr: number,
): Promise<ShiftStaffMember[]> => {
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

  return shiftStaff;
};

export const fetchTentInfo = async (
  shiftNr: number,
  tentNr: number,
): Promise<TentInfo> => {
  const currentYear = getCurrentCampYear();

  const [records, tentScores] = await Promise.all([
    prisma.record.findMany({
      where: { shiftNr, year: currentYear, tentNr, isActive: true },
      select: { child: { select: { name: true } } },
    }),
    prisma.tentScore.findMany({
      where: { shiftNr, year: currentYear, tentNr },
      select: { score: true, createdAt: true, tentNr: true, id: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const childrenInTent = records.map((record) => record.child.name);

  return {
    campers: childrenInTent,
    scores: tentScores.map((score) => {
      return {
        ...score,
        scoreId: score.id,
        createdAt: score.createdAt.toISOString(),
      };
    }),
  };
};

export const fetchTents = async (shiftNr: number) => {
  const currentYear = getCurrentCampYear();

  const tentScores = await prisma.tentScore.findMany({
    where: { shiftNr, year: currentYear },
    select: { score: true, createdAt: true, tentNr: true, id: true },
    orderBy: { createdAt: "asc" },
  });

  return tentScores.map((score) => {
    return {
      ...score,
      scoreId: score.id,
      createdAt: score.createdAt.toISOString(),
    };
  });
};

export const addGrade = async (
  shiftNr: number,
  tentNr: number,
  score: number,
  userId: number,
) => {
  const currentYear = getCurrentCampYear();
  const result = await prisma.tentScore.create({
    data: {
      shiftNr,
      tentNr,
      year: currentYear,
      score: score,
      userId,
    },
    select: { score: true, createdAt: true, tentNr: true, id: true },
  });

  return {
    ...result,
    scoreId: result.id,
    createdAt: result.createdAt.toISOString(),
  };
};
