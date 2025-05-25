import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { fetchShiftRegistrations } from "../../../controllers/registrations.controller";

interface RegistrationsQuery {
  shiftNr: number;
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get<{ Querystring: RegistrationsQuery }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            shiftNr: { type: "integer" },
          },
          required: ["shiftNr"], // TODO: fetch registrations also without the filter.
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.session.user;
      const { shiftNr } = request.query;

      if (!shiftNr) {
        return reply.status(StatusCodes.NOT_IMPLEMENTED).send({
          status: "error",
          message: "Provide a query string for the shift, i.e. ?shiftNr=X",
        });
      }

      const registrations = await fetchShiftRegistrations(
        userId,
        shiftNr,
        fastify.prisma,
      );

      return reply
        .status(StatusCodes.OK)
        .send({ status: "success", data: { registrations } });
    },
  );
};

export default plugin;
