import fs from "fs";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  requireRegistrationView,
  requireShiftPermission,
} from "#app/lib/guards";
import { Permissions } from "#app/constants/permissions";
import {
  BinaryResponse,
  createErrorResponse,
  createFailResponse,
  createSuccessResponse,
  ErrorResponseRef,
  FailResponse,
  RequestPermissionsFail,
  SuccessResponse,
} from "#app/lib/jsend";
import { generateShiftCamperListPDF } from "#app/services/shift-pdf.service";
import { getSessionUser } from "#app/lib/session";

import {
  AddGradeSchema,
  FetchShiftBillingData,
  FetchShiftEmailsData,
  FetchShiftPdfFailData,
  FetchShiftRecordsData,
  FetchShiftsData,
  FetchShiftStaffData,
  FetchShiftUsersData,
  FetchTentsData,
  ShiftResourceFetchParams,
  ShiftTentQuerySchema,
  TentInfoSchema,
  TentScoreSchema,
} from "./shifts.schemas";
import {
  addGrade,
  fetchShiftBilling,
  fetchShiftEmails,
  fetchShiftPrintEntries,
  fetchShiftRecords,
  fetchShifts,
  fetchShiftStaff,
  fetchShiftUsers,
  fetchTentInfo,
  fetchTents,
} from "./shifts.service";

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
    async (_request, reply) => {
      const shifts = await fetchShifts();
      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ shifts }));
    },
  );

  fastify.get(
    "/:shiftNr/pdf",
    {
      preHandler: requireRegistrationView(
        ["pii", "contact"],
        "params",
        "Puuduvad detailse nimekirja nägemise õigused.",
      ),
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: BinaryResponse(
            "application/pdf",
            "The shift camper-list PDF.",
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(FetchShiftPdfFailData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    async (request, reply) => {
      const { shiftNr } = request.params;

      const printEntries = await fetchShiftPrintEntries(shiftNr);

      if (printEntries.length === 0) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            shift: "Vahetust ei ole olemas või puuduvad registreeritud lapsed.",
          }),
        );
      }

      const filePath = await generateShiftCamperListPDF(
        shiftNr,
        printEntries,
        request.log,
      );
      if (!filePath) {
        return reply
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send(createErrorResponse("Viga PDFi genereerimisel."));
      }

      const stream = fs.createReadStream(filePath);
      reply.status(StatusCodes.OK).type("application/pdf");
      return reply.send(stream);
    },
  );

  fastify.get(
    "/:shiftNr/users",
    {
      preHandler: requireShiftPermission(
        Permissions.VIEW_SHIFT_PERMISSIONS,
        "params",
      ),
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftUsersData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const users = await fetchShiftUsers(request.params.shiftNr);
      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ users }));
    },
  );

  fastify.get(
    "/:shiftNr/billing",
    {
      preHandler: requireRegistrationView(["financial"], "params"),
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftBillingData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const records = await fetchShiftBilling(request.params.shiftNr);
      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ records }));
    },
  );

  fastify.get(
    "/:shiftNr/records",
    {
      preHandler: requireShiftPermission(
        Permissions.VIEW_SHIFT_BASIC,
        "params",
      ),
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftRecordsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const records = await fetchShiftRecords(request.params.shiftNr);
      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ records }));
    },
  );

  fastify.get(
    "/:shiftNr/emails",
    {
      preHandler: requireRegistrationView(["contact"], "params"),
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftEmailsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const emails = await fetchShiftEmails(request.params.shiftNr);
      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ emails }));
    },
  );

  fastify.get(
    "/:shiftNr/staff",
    {
      preHandler: requireShiftPermission(
        Permissions.VIEW_SHIFT_STAFF,
        "params",
      ),
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftStaffData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const staff = await fetchShiftStaff(request.params.shiftNr);
      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ staff }));
    },
  );

  fastify.get(
    "/:shiftNr/tents/:tentNr",
    {
      preHandler: requireShiftPermission(
        Permissions.VIEW_SHIFT_BASIC,
        "params",
      ),
      schema: {
        params: ShiftTentQuerySchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(TentInfoSchema),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const { shiftNr, tentNr } = request.params;
      const tentInfo = await fetchTentInfo(shiftNr, tentNr);
      return reply.status(StatusCodes.OK).send(createSuccessResponse(tentInfo));
    },
  );

  fastify.get(
    "/:shiftNr/tents",
    {
      preHandler: requireShiftPermission(
        Permissions.VIEW_SHIFT_BASIC,
        "params",
      ),
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchTentsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const scores = await fetchTents(request.params.shiftNr);
      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ scores }));
    },
  );

  fastify.post(
    "/:shiftNr/tents/:tentNr",
    {
      preHandler: requireShiftPermission(
        Permissions.EDIT_SHIFT_BASIC,
        "params",
      ),
      schema: {
        params: ShiftTentQuerySchema,
        body: AddGradeSchema,
        response: {
          [StatusCodes.CREATED]: SuccessResponse(TentScoreSchema),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      const { shiftNr, tentNr } = request.params;
      const { score } = request.body;
      const { userId } = getSessionUser(request);
      const tentScore = await addGrade(shiftNr, tentNr, score, userId);
      return reply
        .status(StatusCodes.CREATED)
        .send(createSuccessResponse(tentScore));
    },
  );
};

export default plugin;
