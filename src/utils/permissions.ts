import prisma from "./prisma";

import { Permissions } from "#app/constants/permissions";
import { SHIFT_BOSS_ROLES, SHIFT_STAFF_ROLES } from "#app/constants/roles";

export const isUserBoss = async (userId: number) => {
  const userBossInstances = await prisma.userRoles.findMany({
    where: {
      userId,
      role: {
        roleName: {
          in: [...SHIFT_BOSS_ROLES],
        },
      },
    },
    select: { id: true },
  });

  if (userBossInstances.length > 0) return true;

  const userRootInstance = await prisma.user.findUnique({
    where: { id: userId, role: "root" },
    select: { id: true },
  });

  return userRootInstance !== null;
};

export const isSuperRoot = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, role: "root" },
    select: { id: true },
  });
  return user !== null;
};

export const isShiftBoss = async (userId: number, shiftNr: number) => {
  const userShiftBossInstances = await prisma.userRoles.findMany({
    where: {
      userId,
      shiftNr,
      role: {
        roleName: {
          in: [...SHIFT_BOSS_ROLES],
        },
      },
    },
  });

  return userShiftBossInstances.length > 0;
};

export const isShiftMember = async (userId: number, shiftNr: number) => {
  const userShiftRoles = await prisma.userRoles.findMany({
    where: {
      userId,
      shiftNr,
      role: {
        roleName: {
          in: [...SHIFT_STAFF_ROLES],
        },
      },
    },
  });

  return userShiftRoles.length > 0;
};

export const canViewShiftStaff = async (userId: number, shiftNr: number) => {
  const userShiftRoles = await prisma.userRoles.findMany({
    where: {
      userId,
      shiftNr,
      role: {
        role_permissions: {
          some: {
            permission: {
              permissionName: Permissions.VIEW_SHIFT_STAFF,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return userShiftRoles.length > 0;
};
