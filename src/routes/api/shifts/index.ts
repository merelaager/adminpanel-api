import { Type } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  fetchShiftBillingHandler,
  fetchShiftCampersHandler,
  fetchShiftPdfHandler,
  fetchShiftsHandler,
  fetchShiftUsersHandler,
} from "../../../controllers/shifts.controller";

import {
  ShiftResourceFetchParams,
  UserWithShiftRoleSchema,
} from "../../../schemas/shift";
import { CamperRecordSchema } from "../../../schemas/user";
import { ParentBillSchema } from "../../../schemas/billing";

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
        params: ShiftResourceFetchParams,
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
  fastify.get(
    "/:shiftNr/users",
    {
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: Type.Object({
              users: Type.Array(UserWithShiftRoleSchema),
            }),
          }),
          [StatusCodes.FORBIDDEN]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({
              permissions: Type.String(),
            }),
          }),
        },
      },
    },
    fetchShiftUsersHandler,
  );
  fastify.get(
    "/:shiftNr/billing",
    {
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: Type.Object({
              records: Type.Array(ParentBillSchema),
            }),
          }),
          [StatusCodes.FORBIDDEN]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({
              permissions: Type.String(),
            }),
          }),
        },
      },
    },
    fetchShiftBillingHandler,
  );
  fastify.get(
    "/:shiftNr/records",
    {
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: Type.Object({
              records: Type.Array(CamperRecordSchema),
            }),
          }),
          [StatusCodes.FORBIDDEN]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({
              permissions: Type.String(),
            }),
          }),
        },
      },
    },
    fetchShiftCampersHandler,
  );
};

export default plugin;
