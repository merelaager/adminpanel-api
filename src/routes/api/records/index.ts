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
  RecordsFetchSchema,
} from "../../../schemas/record";

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
};

export default plugin;
