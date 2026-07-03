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
  const userShiftRoles = await prisma.userRoles.findMany({
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

  return userShiftRoles.length > 0;
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

const userHasPermissionInAnyShift = async (
  userId: number,
  permission: Permissions,
): Promise<boolean> => {
  const userRoles = await prisma.userRoles.findMany({
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

  return userRoles.length > 0;
};

export const canEditRegistrationPriceAnyShift = (userId: number) =>
  userHasPermissionInAnyShift(userId, Permissions.EDIT_REGISTRATION_PRICE);
