import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import "dotenv/config";

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});

// Make prisma available as a standard import for use in services and utils.
// Not everything has access to the plugin.
// TODO: find a more elegant way to accomplish this.
// The current approach seems to be a Fastify antipattern.
const prisma = new PrismaClient({ adapter });

export default prisma;
