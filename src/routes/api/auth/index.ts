import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  loginHandler,
  userInfoHandler,
} from "../../../controllers/auth.controller";
import { signupUserHandler } from "../../../controllers/users.controller";

import { CredentialsSchema } from "../../../schemas/auth";
import { SignupSchema, UserInfoSchema } from "../../../schemas/user";

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
    "/signup",
    {
      schema: {
        body: SignupSchema,
        response: {
          [StatusCodes.FORBIDDEN]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({ token: Type.String() }),
          }),
          [StatusCodes.CONFLICT]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({ conflict: Type.String() }),
          }),
          [StatusCodes.INTERNAL_SERVER_ERROR]: Type.Object({
            status: Type.Literal("error"),
            message: Type.String(),
          }),
        },
      },
    },
    signupUserHandler,
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
