import { Type } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  fetchRecordsHandler,
  forceSyncRecordsHandler,
} from "../../../controllers/records/fetch.record";

import {
  FlattenedRecord,
  ForceSyncSchema,
  PatchRecordSchema,
  RecordParamsSchema,
  RecordsFetchSchema,
} from "../../../schemas/record";
import { patchRecordHandler } from "../../../controllers/records.controller";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        querystring: RecordsFetchSchema,
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: Type.Object({
              records: Type.Array(FlattenedRecord),
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
          [StatusCodes.NOT_FOUND]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({
              recordId: Type.String(),
            }),
          }),
          [StatusCodes.UNPROCESSABLE_ENTITY]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Partial(
              Type.Object({
                tentNr: Type.String(),
                teamId: Type.String(),
              }),
            ),
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
    patchRecordHandler,
  );
};

export default plugin;
