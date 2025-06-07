import prisma from "./prisma";

export const isUserBoss = async (userId: number) => {
  const userBossInstances = await prisma.userRoles.findMany({
    where: {
      userId,
      role: {
        roleName: "boss",
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
