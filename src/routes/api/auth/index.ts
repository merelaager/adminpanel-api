import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  loginHandler,
  userInfoHandler,
} from "../../../controllers/auth.controller";

import { CredentialsSchema } from "../../../schemas/auth";
import { UserInfoSchema } from "../../../schemas/user";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/me",
    {
      schema: {
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: UserInfoSchema,
          }),
        },
      },
    },
    userInfoHandler,
  );
  fastify.post(
    "/login",
    {
      schema: {
        body: CredentialsSchema,
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: UserInfoSchema,
          }),
          [StatusCodes.UNAUTHORIZED]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({ message: Type.String() }),
          }),
        },
      },
    },
    loginHandler,
  );
  fastify.post(
    "/logout",
    {
      schema: {
        response: {
          [StatusCodes.NO_CONTENT]: {},
        },
      },
    },
    async (request, reply) => {
      await request.session.destroy();
      reply.clearCookie("sessionId");
      return reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
