import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  FetchShiftBillingData,
  fetchShiftBillingHandler,
  FetchShiftEmailsData,
  fetchShiftEmailsHandler,
  FetchShiftPdfFailData,
  fetchShiftPdfHandler,
  FetchShiftRecordsData,
  fetchShiftRecordsHandler,
  FetchShiftsData,
  fetchShiftsHandler,
  FetchShiftUsersData,
  fetchShiftUsersHandler,
} from "#app/controllers/shifts.controller";
import {
  fetchShiftStaff,
  FetchShiftStaffData,
} from "#app/controllers/staff/fetch.staff";
import {
  addGradeHandler,
  fetchTentHandler,
  FetchTentsData,
  fetchTentsHandler,
} from "#app/controllers/tent.controller";

import {
  AddGradeSchema,
  ShiftResourceFetchParams,
  ShiftTentQuerySchema,
} from "#app/schemas/shift";
import { TentInfoSchema, TentScoreSchema } from "#app/schemas/tent";
import {
  ErrorResponseRef,
  FailResponse,
  SuccessResponse,
} from "#app/schemas/jsend";
import { RequestPermissionsFail } from "#app/schemas/responses";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftsData),
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
          [StatusCodes.NOT_FOUND]: FailResponse(FetchShiftPdfFailData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
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
          [StatusCodes.OK]: SuccessResponse(FetchShiftUsersData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
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
          [StatusCodes.OK]: SuccessResponse(FetchShiftBillingData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
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
          [StatusCodes.OK]: SuccessResponse(FetchShiftRecordsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    fetchShiftRecordsHandler,
  );
  fastify.get(
    "/:shiftNr/emails",
    {
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftEmailsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    fetchShiftEmailsHandler,
  );
  fastify.get(
    "/:shiftNr/staff",
    {
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftStaffData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    fetchShiftStaff,
  );
  fastify.get(
    "/:shiftNr/tents/:tentNr",
    {
      schema: {
        params: ShiftTentQuerySchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(TentInfoSchema),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    fetchTentHandler,
  );
  fastify.get(
    "/:shiftNr/tents",
    {
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchTentsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    fetchTentsHandler,
  );
  fastify.post(
    "/:shiftNr/tents/:tentNr",
    {
      schema: {
        params: ShiftTentQuerySchema,
        body: AddGradeSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(TentScoreSchema),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    addGradeHandler,
  );
};

export default plugin;
