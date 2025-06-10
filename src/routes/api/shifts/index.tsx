import { Type } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  fetchShiftPdfHandler,
  fetchShiftsHandler,
} from "../../../controllers/shifts.controller";
import { ShiftPdfFetchSchema } from "../../../schemas/shift";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: Type.Object({
              shifts: Type.Array(Type.Number()),
            }),
          }),
        },
      },
    },
    fetchShiftsHandler,
  );
  fastify.get(
    "/:shiftNr/pdf",
    {
      schema: {
        params: ShiftPdfFetchSchema,
        response: {
          [StatusCodes.NOT_FOUND]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({
              shift: Type.String(),
            }),
          }),
          [StatusCodes.FORBIDDEN]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({
              permissions: Type.String(),
            }),
          }),
          [StatusCodes.INTERNAL_SERVER_ERROR]: Type.Object({
            status: Type.Literal("error"),
            message: Type.String(),
          }),
        },
      },
    },
    fetchShiftPdfHandler,
  );
};

export default plugin;
