import prisma from "./prisma";

export const isUserBoss = async (userId: number) => {
  const userBossInstances = await prisma.userRoles.findMany({
    where: {
      userId,
      role: {
        roleName: {
          in: ["boss", "root"],
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

export const isShiftBoss = async (userId: number, shiftNr: number) => {
  const userShiftBossInstances = await prisma.userRoles.findMany({
    where: {
      userId,
      shiftNr,
      role: {
        roleName: {
          in: ["boss", "root"],
        },
      },
    },
  });

  return userShiftBossInstances.length > 0;
};
