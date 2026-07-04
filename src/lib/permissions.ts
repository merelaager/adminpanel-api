import prisma from "#app/lib/prisma";

import {
  Permissions,
  PermissionPrefixes,
} from "#app/constants/permissions";

export const isSuperRoot = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, role: "root" },
    select: { id: true },
  });
  return user !== null;
};

export const userHasShiftPermission = async (
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

export const userHasPermissionInAnyShift = async (
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

export const fetchUserShiftPermissions = async (
  userId: number,
  shiftNr: number,
  permissionPrefix: PermissionPrefixes,
) => {
  const userShiftRolesRaw = await prisma.userRoles.findMany({
    where: { userId, shiftNr },
    select: {
      role: {
        select: {
          role_permissions: {
            where: {
              permission: {
                permissionName: { startsWith: permissionPrefix },
              },
            },
            select: { permission: { select: { permissionName: true } } },
          },
        },
      },
    },
  });

  const shiftPermissions = new Set<string>();
  for (const shiftRole of userShiftRolesRaw) {
    for (const permission of shiftRole.role.role_permissions) {
      shiftPermissions.add(permission.permission.permissionName);
    }
  }

  return shiftPermissions;
};

export type RegistrationViewFlags = {
  pii: boolean;
  financial: boolean;
  contact: boolean;
};

export const getRegistrationViewFlags = async (
  userId: number,
  shiftNr: number,
): Promise<RegistrationViewFlags> => {
  const shiftViewPermissions = await fetchUserShiftPermissions(
    userId,
    shiftNr,
    PermissionPrefixes.REGISTRATION_VIEW,
  );

  const pii =
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_FULL) ||
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_PERSONAL_INFO);

  const financial =
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_FULL) ||
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_PRICE);

  const contact =
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_FULL) ||
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_CONTACT);

  return { pii, financial, contact };
};
