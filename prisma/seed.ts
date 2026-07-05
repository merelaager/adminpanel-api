import prisma from "#app/lib/prisma";
import { seedRolesAndPermissions } from "./seed-core";

seedRolesAndPermissions(prisma)
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
