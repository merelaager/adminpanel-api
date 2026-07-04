import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import {
  FetchRecordsData,
  fetchRecordsHandler,
  forceSyncRecordsHandler,
} from "#app/controllers/records/fetch.record";
import {
  PatchRecordFailDataNF,
  PatchRecordFailDataUE,
  patchRecordHandler,
} from "#app/controllers/records.controller";

import {
  ForceSyncSchema,
  PatchRecordSchema,
  RecordParamsSchema,
  RecordsFetchSchema,
} from "#app/schemas/record";
import { FailResponse, SuccessResponse } from "#app/lib/jsend";
import { RequestPermissionsFail } from "#app/lib/jsend";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        querystring: RecordsFetchSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchRecordsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    fetchRecordsHandler,
  );
  fastify.post(
    "/",
    {
      schema: {
        body: ForceSyncSchema,
      },
    },
    forceSyncRecordsHandler,
  );
  fastify.patch(
    "/:recordId",
    {
      schema: {
        params: RecordParamsSchema,
        body: PatchRecordSchema,
        response: {
          [StatusCodes.NOT_FOUND]: FailResponse(PatchRecordFailDataNF),
          [StatusCodes.BAD_REQUEST]: FailResponse(
            Type.Object({ tentNr: Type.String() }),
          ),
          [StatusCodes.UNPROCESSABLE_ENTITY]: FailResponse(
            PatchRecordFailDataUE,
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    patchRecordHandler,
  );
};

export default plugin;
