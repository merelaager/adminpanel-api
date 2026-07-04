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

  return printEntries;
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

  const usersWithShiftRole: UserWithShiftRole[] = [];
  rawUsersAndPermissions.forEach((obj) => {
    usersWithShiftRole.push({
      userId: obj.user.id,
      name: obj.user.name,
      shiftNr,
      role: getRoleDisplayName(obj.role.roleName),
      roleId: obj.role.id,
    });
  });

  return usersWithShiftRole;
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

  return camperRecords;
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

export const fetchShiftBilling = async (
  shiftNr: number,
): Promise<ParentBillData[]> => {
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

  return Array.from(registrationMap.values());
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
) => {
  const currentYear = getCurrentCampYear();
  const result = await prisma.tentScore.create({
    data: {
      shiftNr,
      tentNr,
      year: currentYear,
      score: score,
    },
    select: { score: true, createdAt: true, tentNr: true, id: true },
  });

  return {
    ...result,
    scoreId: result.id,
    createdAt: result.createdAt.toISOString(),
  };
};
