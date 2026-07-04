import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";

import { requireShiftPermission } from "#app/lib/guards";
import { Permissions } from "#app/constants/permissions";
import { getSessionUser } from "#app/lib/session";
import {
  createFailResponse,
  createSuccessResponse,
  FailResponse,
  RequestPermissionsFail,
  SuccessResponse,
} from "#app/lib/jsend";

import {
  FetchRecordsData,
  ForceSyncSchema,
  PatchRecordFailDataNF,
  PatchRecordFailDataUE,
  PatchRecordSchema,
  RecordParamsSchema,
  RecordsFetchSchema,
} from "./records.schemas";
import {
  fetchRecordsForQuery,
  forceSyncRecords,
  patchRecord,
} from "./records.service";

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
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const records = await fetchRecordsForQuery(
        request.query,
        userId,
        request.log,
      );

      if (records === null) {
        return reply
          .status(StatusCodes.FORBIDDEN)
          .send(createFailResponse({ permissions: "Ligipääsuõigused puuduvad" }));
      }

      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ records }));
    },
  );

  fastify.post(
    "/",
    {
      preHandler: requireShiftPermission(Permissions.EDIT_SHIFT_BASIC, "body"),
      schema: {
        body: ForceSyncSchema,
      },
    },
    async (request, reply) => {
      const { shiftNr, forceSync } = request.body;
      const result = await forceSyncRecords(shiftNr, forceSync);

      if (result === "not-modified") {
        return reply.status(StatusCodes.NOT_MODIFIED).send();
      }
      if (result === "shift-not-found") {
        return reply.status(StatusCodes.NOT_FOUND).send();
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );

  fastify.patch(
    "/:recordId",
    {
      schema: {
        params: RecordParamsSchema,
        body: PatchRecordSchema,
        response: {
          [StatusCodes.NO_CONTENT]: Type.Null(),
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
    async (request, reply) => {
      const { recordId } = request.params;
      const { userId } = getSessionUser(request);

      const result = await patchRecord(userId, recordId, request.body);

      if (result === "record-not-found") {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(
            createFailResponse({
              recordId: `Kirjet ei leitud. (id: ${recordId})`,
            }),
          );
      }

      if (result === "forbidden") {
        return reply
          .status(StatusCodes.FORBIDDEN)
          .send(
            createFailResponse({ permissions: "Puuduvad õigused päringuks." }),
          );
      }

      if (result === "team-not-found") {
        return reply.status(StatusCodes.UNPROCESSABLE_ENTITY).send(
          createFailResponse({
            teamId: `Meeskonda ei leitud või see ei kuulu vahetusse. (id: ${request.body.teamId})`,
          }),
        );
      }

      return reply.status(StatusCodes.NO_CONTENT).send(null);
    },
  );
};

export default plugin;
