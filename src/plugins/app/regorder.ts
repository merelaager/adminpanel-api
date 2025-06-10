import "dotenv/config";

import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import prisma from "../../utils/prisma";

export type TRegOrder = InstanceType<typeof RegOrder>;

class RegOrder {
  private regOrder: number;

  constructor(currentOrder: number) {
    this.regOrder = currentOrder;
    console.log("RegOrder initialised:", currentOrder);
  }

  getOrder() {
    this.regOrder += 1;
    return this.regOrder;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    regorder: RegOrder;
  }
}

const regorderPlugin: FastifyPluginAsync = fp(async (server) => {
  const latestRegGroup = await prisma.registration.findMany({
    orderBy: {
      regOrder: "desc",
    },
    take: 1,
    select: { regOrder: true },
  });

  let initialOrder = 0;
  if (latestRegGroup.length > 0) {
    initialOrder = latestRegGroup[0].regOrder;
  }

  server.decorate("regorder", new RegOrder(initialOrder));
});

export default regorderPlugin;
