import prisma from "./prisma";

import { Permissions } from "#app/constants/permissions";

export const isSuperRoot = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, role: "root" },
    select: { id: true },
  });
  return user !== null;
};

const userHasShiftPermission = async (
  userId: number,
  shiftNr: number,
  permission: Permissions,
): Promise<boolean> => {
  const userShiftRole = await prisma.userRoles.findFirst({
    where: {
      userId,
      shiftNr,
      role: {
        role_permissions: {
          some: {
            permission: {
              permissionName: permission,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return userShiftRole !== null;
};

export const canViewShiftStaff = (userId: number, shiftNr: number) =>
  userHasShiftPermission(userId, shiftNr, Permissions.VIEW_SHIFT_STAFF);

export const canViewShiftBasic = (userId: number, shiftNr: number) =>
  userHasShiftPermission(userId, shiftNr, Permissions.VIEW_SHIFT_BASIC);

export const canEditShiftBasic = (userId: number, shiftNr: number) =>
  userHasShiftPermission(userId, shiftNr, Permissions.EDIT_SHIFT_BASIC);

export const canEditShiftMembers = (userId: number, shiftNr: number) =>
  userHasShiftPermission(userId, shiftNr, Permissions.EDIT_SHIFT_MEMBERS);

export const canViewShiftPermissions = (userId: number, shiftNr: number) =>
  userHasShiftPermission(userId, shiftNr, Permissions.VIEW_SHIFT_PERMISSIONS);

export const userHasShiftPermissionInAnyOf = async (
  userId: number,
  shiftNrs: number[],
  permission: Permissions,
): Promise<boolean> => {
  const userShiftRole = await prisma.userRoles.findFirst({
    where: {
      userId,
      shiftNr: { in: shiftNrs },
      role: {
        role_permissions: {
          some: {
            permission: {
              permissionName: permission,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return userShiftRole !== null;
};

const userHasPermissionInAnyShift = async (
  userId: number,
  permission: Permissions,
): Promise<boolean> => {
  const userRole = await prisma.userRoles.findFirst({
    where: {
      userId,
      role: {
        role_permissions: {
          some: {
            permission: {
              permissionName: permission,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return userRole !== null;
};

export const canEditRegistrationPriceAnyShift = (userId: number) =>
  userHasPermissionInAnyShift(userId, Permissions.EDIT_REGISTRATION_PRICE);
