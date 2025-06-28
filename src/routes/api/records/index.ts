import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  FetchRecordsData,
  fetchRecordsHandler,
  forceSyncRecordsHandler,
} from "../../../controllers/records/fetch.record";
import {
  PatchRecordFailDataNF,
  PatchRecordFailDataUE,
  patchRecordHandler,
} from "../../../controllers/records.controller";

import {
  ForceSyncSchema,
  PatchRecordSchema,
  RecordParamsSchema,
  RecordsFetchSchema,
} from "../../../schemas/record";
import { FailResponse, SuccessResponse } from "../../../schemas/jsend";
import { RequestPermissionsFail } from "../../../schemas/responses";

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
