import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { createBillHandler } from "../../../controllers/bills.controller";

import { BillCreationSchema } from "../../../schemas/bill";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/",
    {
      schema: {
        body: BillCreationSchema,
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: Type.Object({
              billNr: Type.Integer(),
            }),
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
    createBillHandler,
  );
};

export default plugin;
