import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { createFailResponse, FailResponse } from "#app/lib/jsend";

import {
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
} from "./account.schemas";
import { confirmPasswordReset, requestPasswordReset } from "./account.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/password-reset",
    {
      config: {
        public: true,
        rateLimit: {
          max: 2,
          timeWindow: "1 hour",
        },
      },
      schema: {
        body: PasswordResetRequestSchema,
        response: {
          [StatusCodes.ACCEPTED]: {},
        },
      },
    },
    async (request, reply) => {
      // Always 202, regardless of whether the email exists or the mail send
      // fails, to avoid user enumeration.
      await requestPasswordReset(
        request.body.email,
        request.server.mailer,
        request.server.config.APP_URL,
        request.log,
      );
      return reply.status(StatusCodes.ACCEPTED).send();
    },
  );

  fastify.put(
    "/password",
    {
      config: {
        public: true,
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
        },
      },
      schema: {
        body: PasswordResetConfirmSchema,
        response: {
          [StatusCodes.NO_CONTENT]: {},
          [StatusCodes.FORBIDDEN]: {},
          [StatusCodes.UNPROCESSABLE_ENTITY]: FailResponse(
            Type.Object({ password: Type.String() }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { token, password } = request.body;
      const result = await confirmPasswordReset(token, password);

      if (result.status === "forbidden") {
        return reply.status(StatusCodes.FORBIDDEN).send();
      }

      if (result.status === "weak-password") {
        return reply
          .status(StatusCodes.UNPROCESSABLE_ENTITY)
          .send(createFailResponse({ password: result.reason }));
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
