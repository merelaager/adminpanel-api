import { Type } from "@sinclair/typebox";
import { FastifyPluginAsync } from "fastify";
import { StatusCodes } from "http-status-codes";

import {
  createUser,
  getUsers,
  UserCreateBasis,
} from "../../../controllers/users.controller";

import { UserCreateSchema } from "../../../schemas/user";

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/users", async (request, reply) => {
    const users = await getUsers(fastify.prisma);
    reply.code(200).send({ status: "success", data: { users } });
  });

  fastify.post(
    "/users",
    {
      schema: {
        body: UserCreateSchema,
        response: {
          [StatusCodes.CREATED]: {
            status: "success",
            data: {
              userId: Type.Number(),
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userInput = request.body as UserCreateBasis;
      const creationData = await createUser(userInput, fastify.prisma);

      if (creationData.success) {
        const createdUser = creationData.data;
        reply
          .code(StatusCodes.CREATED)
          .send({ status: "success", data: { userId: createdUser?.id } });
      } else if (creationData.userError) {
        reply
          .code(StatusCodes.BAD_REQUEST)
          .send({ status: "fail", data: { message: creationData.error } });
      } else {
        reply
          .code(StatusCodes.INTERNAL_SERVER_ERROR)
          .send({ status: "error", error: creationData.error });
      }
    },
  );
};

export default routes;
