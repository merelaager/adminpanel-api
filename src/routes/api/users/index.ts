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
import { ErrorResponseRef, FailResponse } from "#app/schemas/jsend";

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
  // fastify.get("/users", async (request, reply) => {
  //   const users = await getUsers(fastify.prisma);
  //   reply.code(200).send({ status: "success", data: { users } });
  // });
  // fastify.post(
  //   "/users",
  //   {
  //     schema: {
  //       body: UserCreateSchema,
  //       response: {
  //         [StatusCodes.CREATED]: {
  //           status: "success",
  //           data: {
  //             userId: Type.Number(),
  //           },
  //         },
  //       },
  //     },
  //   },
  //   async (request, reply) => {
  //     const userInput = request.body as UserCreateBasis;
  //     const creationData = await createUser(userInput, fastify.prisma);
  //
  //     if (creationData.success) {
  //       const createdUser = creationData.data;
  //       reply
  //         .code(StatusCodes.CREATED)
  //         .send({ status: "success", data: { userId: createdUser?.id } });
  //     } else if (creationData.userError) {
  //       reply
  //         .code(StatusCodes.BAD_REQUEST)
  //         .send({ status: "fail", data: { message: creationData.error } });
  //     } else {
  //       reply
  //         .code(StatusCodes.INTERNAL_SERVER_ERROR)
  //         .send({ status: "error", error: creationData.error });
  //     }
  //   },
  // );
};

export default plugin;
