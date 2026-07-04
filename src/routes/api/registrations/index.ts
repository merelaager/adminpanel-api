import { RouteShorthandOptions } from "fastify";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import {
  patchRegistrationData,
  registrationsCampersSyncHandler,
  registrationsFetchHandler,
} from "#app/controllers/registration/registrations.controller";
import {
  FormRegistrationData,
  FormRegistrationFailData,
  formRegistrationHandler,
} from "#app/controllers/registration/create.registration";

import {
  FilteredRegistrationSchema,
  PatchRegistrationParamsSchema,
  PatchRegistrationSchema,
  RegistrationsCreationSchema,
  RegistrationsFetchSchema,
} from "#app/schemas/registration";
import {
  ErrorResponseRef,
  FailResponse,
  SuccessResponse,
} from "#app/lib/jsend";
import { getSessionUser } from "#app/lib/session";
import type { Route } from "#app/schemas/route";

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
    registrationsFetchHandler,
  );

  fastify.post("/sync", registrationsCampersSyncHandler);

  fastify.post(
    "/",
    {
      config: { public: true },
      schema: {
        body: RegistrationsCreationSchema,
        response: {
          [StatusCodes.CREATED]: SuccessResponse(FormRegistrationData),
          [StatusCodes.BAD_REQUEST]: FailResponse(FormRegistrationFailData),
        },
      },
    },
    formRegistrationHandler,
  );

  const patchSchema = <RouteShorthandOptions>{
    schema: {
      params: PatchRegistrationParamsSchema,
      body: PatchRegistrationSchema,
      response: {
        [StatusCodes.NOT_FOUND]: FailResponse(
          Type.Object({ message: Type.String() }),
        ),
      },
    },
  };

  fastify.patch<
    Route<{
      params: typeof PatchRegistrationParamsSchema;
      body: typeof PatchRegistrationSchema;
    }>
  >("/:regId", patchSchema, async (request, reply) => {
    const { userId } = getSessionUser(request);
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
        data: {
          message: `Registreerimist ei leitud või puuduvad piisavad õigused. (id: ${regId})`,
        },
      });
    }

    return reply.status(StatusCodes.NO_CONTENT).send();
  });
};

export default plugin;
