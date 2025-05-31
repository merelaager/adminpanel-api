import { PrismaClient } from "@prisma/client";

// Make prisma available as a standard import for use in services and utils.
// Not everything has access to the plugin.
// TODO: find a more elegant way to accomplish this.
// The current approach seems to be a Fastify antipattern.
const prisma = new PrismaClient();

export default prisma;
