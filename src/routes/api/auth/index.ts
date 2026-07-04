import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { getSessionUser } from "#app/lib/session";
import {
  createErrorResponse,
  createFailResponse,
  createSuccessResponse,
  ErrorResponseRef,
  FailResponse,
  SuccessResponse,
} from "#app/lib/jsend";

import { UserInfoSchema } from "#app/routes/api/users/users.schemas";
import {
  CredentialsSchema,
  PasswordSchema,
  SignupSchema,
} from "./auth.schemas";
import {
  authenticateUser,
  formatUserInfo,
  getUserInfo,
  setPassword,
  signupUser,
} from "./auth.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/me",
    {
      schema: {
        response: {
          [StatusCodes.OK]: SuccessResponse(UserInfoSchema),
          [StatusCodes.FORBIDDEN]: {},
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const info = await getUserInfo(userId);

      if (info === null) {
        return reply.status(StatusCodes.FORBIDDEN).send();
      }

      return reply.status(StatusCodes.OK).send(createSuccessResponse(info));
    },
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
    async (request, reply) => {
      const { username, password } = request.body;

      const user = await authenticateUser(username, password);
      if (!user) {
        return reply
          .code(StatusCodes.UNAUTHORIZED)
          .send(
            createFailResponse({ message: "Vale kasutajanimi või parool." }),
          );
      }

      await request.session.regenerate();
      request.session.user = { userId: user.id };
      await request.session.save();

      return reply
        .code(StatusCodes.OK)
        .send(createSuccessResponse(await formatUserInfo(user)));
    },
  );

  fastify.post(
    "/signup",
    {
      config: {
        public: true,
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        body: SignupSchema,
        response: {
          [StatusCodes.CREATED]: {},
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ token: Type.String() }),
          ),
          [StatusCodes.CONFLICT]: FailResponse(
            Type.Object({ conflict: Type.String() }),
          ),
          [StatusCodes.UNPROCESSABLE_ENTITY]: FailResponse(
            Type.Object({ password: Type.String() }),
          ),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    async (request, reply) => {
      const result = await signupUser(request.body, request.log);

      switch (result.status) {
        case "invalid-token":
          return reply
            .status(StatusCodes.FORBIDDEN)
            .send(createFailResponse({ token: `Pääsmik ei kehti.` }));
        case "expired-token":
          return reply
            .status(StatusCodes.FORBIDDEN)
            .send(createFailResponse({ token: `Pääsmik on aegunud.` }));
        case "weak-password":
          return reply
            .status(StatusCodes.UNPROCESSABLE_ENTITY)
            .send(createFailResponse({ password: result.reason }));
        case "conflict":
          return reply.status(StatusCodes.CONFLICT).send(
            createFailResponse({
              conflict: "Kasutajanimi on juba kasutuses.",
            }),
          );
        case "error":
          return reply
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .send(createErrorResponse("Serveri viga kasutaja loomisel."));
        case "created":
          return reply.status(StatusCodes.CREATED).send();
      }
    },
  );

  fastify.post(
    "/password",
    {
      schema: {
        body: PasswordSchema,
        response: {
          [StatusCodes.NO_CONTENT]: {},
          [StatusCodes.UNAUTHORIZED]: FailResponse(
            Type.Object({ currentPassword: Type.String() }),
          ),
          [StatusCodes.UNPROCESSABLE_ENTITY]: FailResponse(
            Type.Object({ password: Type.String() }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const { currentPassword, password } = request.body;

      const result = await setPassword(
        userId,
        currentPassword,
        password,
        request.session.sessionId,
      );

      if (result.status === "wrong-password") {
        return reply
          .status(StatusCodes.UNAUTHORIZED)
          .send(createFailResponse({ currentPassword: "Vale salasõna." }));
      }

      if (result.status === "weak-password") {
        return reply
          .status(StatusCodes.UNPROCESSABLE_ENTITY)
          .send(createFailResponse({ password: result.reason }));
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
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
