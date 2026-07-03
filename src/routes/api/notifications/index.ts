import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { sendBillHandler } from "#app/controllers/notifications/billing.controller";

import { SingleBillSendSchema } from "#app/schemas/shift";
import { ErrorResponseRef, FailResponse } from "#app/schemas/jsend";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/bills",
    {
      schema: {
        body: SingleBillSendSchema,
        response: {
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(
            Type.Union([
              Type.Object({ email: Type.String() }),
              Type.Object({ registrations: Type.String() }),
            ]),
          ),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    sendBillHandler,
  );
};

export default plugin;
