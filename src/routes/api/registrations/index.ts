import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { requireRoot } from "#app/lib/guards";
import { getSessionUser } from "#app/lib/session";
import {
  createErrorResponse,
  createFailResponse,
  createSuccessResponse,
  ErrorResponseRef,
  FailResponse,
  SuccessResponse,
} from "#app/lib/jsend";

import {
  FilteredRegistrationSchema,
  FormRegistrationData,
  FormRegistrationFailData,
  PatchRegistrationParamsSchema,
  PatchRegistrationSchema,
  RegistrationsCreationSchema,
  RegistrationsFetchSchema,
} from "./registrations.schemas";
import { createRegistrations } from "./create.service";
import {
  fetchRegistrations,
  patchRegistrationData,
  syncCampers,
} from "./registrations.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        querystring: RegistrationsFetchSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(
            Type.Object({
              registrations: Type.Array(FilteredRegistrationSchema),
            }),
          ),
          [StatusCodes.NOT_IMPLEMENTED]: ErrorResponseRef,
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const result = await fetchRegistrations(userId, request.query.shiftNr);

      if (result.status === "no-shift") {
        return reply
          .status(StatusCodes.NOT_IMPLEMENTED)
          .send(
            createErrorResponse(
              "Provide a query string for the shift, i.e. ?shiftNr=X",
            ),
          );
      }

      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ registrations: result.registrations }));
    },
  );

  fastify.post(
    "/sync",
    {
      preHandler: requireRoot,
    },
    async (_request, reply) => {
      await syncCampers();
      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );

  fastify.post(
    "/",
    {
      config: {
        public: true,
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        body: RegistrationsCreationSchema,
        response: {
          [StatusCodes.CREATED]: SuccessResponse(FormRegistrationData),
          [StatusCodes.BAD_REQUEST]: FailResponse(FormRegistrationFailData),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    async (request, reply) => {
      const currentOrder = request.server.regorder.getOrder();

      const result = await createRegistrations(
        request.body,
        currentOrder,
        request.server.mailer,
        request.server.config.APP_URL,
        request.log,
      );

      if (result.status === "bad-request") {
        return reply
          .status(StatusCodes.BAD_REQUEST)
          .send(createFailResponse(result.failData));
      }

      if (result.status === "db-error") {
        return reply
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send(createErrorResponse("Error communicating with the database"));
      }

      return reply
        .status(StatusCodes.CREATED)
        .send(createSuccessResponse({ registrationId: result.registrationId }));
    },
  );

  fastify.patch(
    "/:regId",
    {
      schema: {
        params: PatchRegistrationParamsSchema,
        body: PatchRegistrationSchema,
        response: {
          [StatusCodes.NO_CONTENT]: Type.Null(),
          [StatusCodes.NOT_FOUND]: FailResponse(
            Type.Object({ message: Type.String() }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const { regId } = request.params;

      const status = await patchRegistrationData(userId, regId, request.body);

      // Do not leak whether the reg does not exist or whether the
      // user has insufficient permissions.
      if (!status) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            message: `Registreerimist ei leitud või puuduvad piisavad õigused. (id: ${regId})`,
          }),
        );
      }

      return reply.status(StatusCodes.NO_CONTENT).send(null);
    },
  );
};

export default plugin;
