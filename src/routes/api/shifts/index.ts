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
} from "../../../controllers/shifts.controller";
import {
  fetchShiftStaff,
  FetchShiftStaffData,
} from "../../../controllers/staff/fetch.staff";
import {
  addGradeHandler,
  fetchTentHandler,
  FetchTentsData,
  fetchTentsHandler,
} from "../../../controllers/tent.controller";

import {
  AddGradeSchema,
  ShiftResourceFetchParams,
  ShiftTentQuerySchema,
} from "../../../schemas/shift";
import { TentInfoSchema, TentScoreSchema } from "../../../schemas/tent";
import {
  ErrorResponse,
  FailResponse,
  SuccessResponse,
} from "../../../schemas/jsend";
import { RequestPermissionsFail } from "../../../schemas/responses";

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
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponse,
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
        [StatusCodes.OK]: SuccessResponse(TentScoreSchema),
        [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
      },
    },
    addGradeHandler,
  );
};

export default plugin;
