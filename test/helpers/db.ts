import "./test-env";
import prisma from "#app/lib/prisma";
import { seedRolesAndPermissions } from "../../prisma/seed-core";

// Every app table, by its exact @@map name. Order is irrelevant because FK
// checks are disabled during truncation.
const TABLES = [
  "bills",
  "certificates",
  "children",
  "documents",
  "event_info",
  "general_info",
  "permissions",
  "records",
  "registrations",
  "reset_tokens",
  "role_permissions",
  "roles",
  "sessions",
  "shift_staff",
  "shifts",
  "signup_tokens",
  "teams",
  "tent_scores",
  "user_roles",
  "users",
] as const;

// Truncates every app table and re-seeds roles/permissions. Guarded so it can
// only ever run against the dedicated test database.
export const resetDb = async (): Promise<void> => {
  if (process.env.DATABASE_NAME !== "ml_test") {
    throw new Error(
      `resetDb refused: DATABASE_NAME is "${process.env.DATABASE_NAME}", expected "ml_test"`,
    );
  }

  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");

  await seedRolesAndPermissions(prisma);
};

export { prisma };
