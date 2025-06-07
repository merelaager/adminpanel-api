import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { sendBillHandler } from "../../../controllers/notifications/billing.controller";

import { SingleBillSendSchema } from "../../../schemas/shift";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/bills",
    {
      schema: {
        body: SingleBillSendSchema,
        response: {
          [StatusCodes.FORBIDDEN]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({ permissions: Type.String() }),
          }),
          [StatusCodes.NOT_FOUND]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Union([
              Type.Object({ email: Type.String() }),
              Type.Object({ registrations: Type.String() }),
            ]),
          }),
          [StatusCodes.INTERNAL_SERVER_ERROR]: Type.Object({
            status: Type.Literal("error"),
            message: Type.String(),
          }),
        },
      },
    },
    sendBillHandler,
  );
};

export default plugin;
