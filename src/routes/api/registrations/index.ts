import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  fetchShiftRegistrations,
  patchRegistrationData,
} from "../../../controllers/registrations.controller";

import {
  FilteredRegistrationSchema,
  PatchRegistrationBody,
  PatchRegistrationSchema,
} from "../../../schemas/registration";

interface RegistrationsQuery {
  shiftNr: number;
}

interface PatchParams {
  regId: number;
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get<{ Querystring: RegistrationsQuery }>(
    "/",
    {
      schema: {
        querystring: Type.Object({ shiftNr: Type.Integer() }), // TODO: fetch registrations also without the filter.
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: Type.Object({
              registrations: Type.Array(FilteredRegistrationSchema),
            }),
          }),
          [StatusCodes.NOT_IMPLEMENTED]: Type.Object({
            status: Type.Literal("error"),
            message: Type.String(),
          }),
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

  fastify.patch<{ Params: PatchParams; Body: PatchRegistrationBody }>(
    "/:regId",
    {
      schema: {
        params: Type.Object({ regId: Type.Integer() }),
        body: PatchRegistrationSchema,
        response: {
          [StatusCodes.NOT_FOUND]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({ message: Type.String() }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.session.user;
      const { regId } = request.params;

      const status = await patchRegistrationData(
        userId,
        regId,
        request.body,
        fastify.prisma,
      );

      // Do not leak whether the reg does not exist or whether the
      // user has insufficient permissions.
      if (!status) {
        return reply.status(StatusCodes.NOT_FOUND).send({
          status: "fail",
          data: { message: `Registration with id ${regId} not found` },
        });
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
