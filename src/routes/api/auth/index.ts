import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import {
  loginHandler,
  setPasswordHandler,
  userInfoHandler,
} from "#app/controllers/auth.controller";
import { signupUserHandler } from "#app/controllers/users.controller";

import { CredentialsSchema, PasswordSchema } from "#app/schemas/auth";
import { SignupSchema, UserInfoSchema } from "#app/schemas/user";
import {
  ErrorResponseRef,
  FailResponse,
  SuccessResponse,
} from "#app/schemas/jsend";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/me",
    {
      schema: {
        response: {
          [StatusCodes.OK]: SuccessResponse(UserInfoSchema),
        },
      },
    },
    userInfoHandler,
  );
  fastify.post(
    "/login",
    {
      config: {
        public: true,
        rateLimit: {
          max: 3,
          timeWindow: "1 minute",
        },
      },
      schema: {
        body: CredentialsSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(UserInfoSchema),
          [StatusCodes.UNAUTHORIZED]: FailResponse(
            Type.Object({ message: Type.String() }),
          ),
        },
      },
    },
    loginHandler,
  );
  fastify.post(
    "/signup",
    {
      config: { public: true },
      schema: {
        body: SignupSchema,
        response: {
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ token: Type.String() }),
          ),
          [StatusCodes.CONFLICT]: FailResponse(
            Type.Object({ conflict: Type.String() }),
          ),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    signupUserHandler,
  );
  fastify.post(
    "/password",
    {
      schema: {
        body: PasswordSchema,
      },
    },
    setPasswordHandler,
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
