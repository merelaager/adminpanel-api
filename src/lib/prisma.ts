import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "#app/generated/prisma/client";
import "dotenv/config";

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});

// Make prisma available as a standard import for use in services and utils.
// Stuff would not have access to it if we used a plugin.
// Still, the current approach seems to be a Fastify antipattern.
const prisma = new PrismaClient({ adapter });

export default prisma;
