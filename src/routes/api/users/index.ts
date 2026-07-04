import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import {
  inviteUserHandler,
  patchUserHandler,
} from "#app/controllers/users.controller";

import {
  CreateInviteSchema,
  PatchUserSchema,
  UserParamsSchema,
} from "#app/schemas/user";
import { ErrorResponseRef, FailResponse } from "#app/lib/jsend";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.patch(
    "/:userId",
    {
      schema: {
        params: UserParamsSchema,
        body: PatchUserSchema,
        response: {
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Partial(
              Type.Object({
                userId: Type.String(),
                currentShift: Type.String(),
              }),
            ),
          ),
        },
      },
    },
    patchUserHandler,
  );
  fastify.post(
    "/invites",
    {
      schema: {
        body: CreateInviteSchema,
        response: {
          [StatusCodes.UNPROCESSABLE_ENTITY]: FailResponse(
            Type.Object({
              role: Type.String(),
            }),
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({
              permissions: Type.String(),
            }),
          ),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    inviteUserHandler,
  );
};

export default plugin;
