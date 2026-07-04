import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import {
  createBillHandler,
  fetchBillHandler,
} from "#app/controllers/bills.controller";

import { BillCreationSchema, BillParamsSchema } from "#app/schemas/bill";
import {
  ErrorResponseRef,
  FailResponse,
  SuccessResponse,
} from "#app/lib/jsend";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/:billId",
    {
      schema: {
        params: BillParamsSchema,
        response: {
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(
            Type.Object({ billId: Type.String() }),
          ),
        },
      },
    },
    fetchBillHandler,
  );
  fastify.post(
    "/",
    {
      schema: {
        body: BillCreationSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(
            Type.Object({
              billNr: Type.Integer(),
            }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(
            Type.Union([
              Type.Object({ email: Type.String() }),
              Type.Object({ registrations: Type.String() }),
              Type.Object({ permissions: Type.String() }),
            ]),
          ),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    createBillHandler,
  );
};

export default plugin;
