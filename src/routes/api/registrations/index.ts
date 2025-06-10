import { RouteShorthandOptions } from "fastify";
import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  patchRegistrationData,
  registrationsFetchHandler,
} from "../../../controllers/registration/registrations.controller";
import { createRegistrationFromParentData } from "../../../controllers/registration/create.registration";

import {
  FilteredRegistrationSchema,
  PatchRegistrationBody,
  PatchRegistrationSchema,
  PostRegistrationBody,
  RegistrationsCreationSchema,
  RegistrationsFetchSchema,
} from "../../../schemas/registration";

interface PatchParams {
  regId: number;
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        querystring: RegistrationsFetchSchema,
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
    registrationsFetchHandler,
  );

  const postSchema = <RouteShorthandOptions>{
    schema: {
      body: RegistrationsCreationSchema,
    },
  };

  fastify.post<{ Body: PostRegistrationBody }>(
    "/",
    postSchema,
    async (request, reply) => {
      const suppliedData = request.body;
      const result = await createRegistrationFromParentData(
        suppliedData,
        fastify.prisma,
        fastify.mailer,
      );
      reply.status(result.code).send(result.response);
    },
  );

  const patchSchema = <RouteShorthandOptions>{
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
  };

  fastify.patch<{ Params: PatchParams; Body: PatchRegistrationBody }>(
    "/:regId",
    patchSchema,
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
          data: {
            message: `Registreerimist ei leitud või puuduvad piisavad õigused. (id: ${regId})`,
          },
        });
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
