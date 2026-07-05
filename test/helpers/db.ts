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

  // The MariaDB adapter pools connections, and `SET FOREIGN_KEY_CHECKS` is a
  // per-connection session flag. Pin every statement to one connection via an
  // interactive transaction so the disabled FK checks actually apply to the
  // TRUNCATEs (which auto-commit but leave the session flag intact).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of TABLES) {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
    }
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  });

  await seedRolesAndPermissions(prisma);
};

export { prisma };
