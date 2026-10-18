import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { requireAnyShiftPermission } from "#app/lib/guards";
import { getSessionUser } from "#app/lib/session";
import { Permissions } from "#app/constants/permissions";
import {
  createFailResponse,
  createSuccessResponse,
  FailResponse,
  SuccessResponse,
} from "#app/lib/jsend";

import { PayerAccountSchema, PaymentRecordSchema } from "./payments.schemas";
import { fetchPayerAccounts, recordPayment } from "./payments.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/accounts",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.RECORD_PAYMENTS,
        "Puuduvad maksete vaatamise õigused.",
      ),
      schema: {
        response: {
          [StatusCodes.OK]: SuccessResponse(
            Type.Object({ accounts: Type.Array(PayerAccountSchema) }),
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
        },
      },
    },
    async (_request, reply) => {
      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ accounts: await fetchPayerAccounts() }));
    },
  );

  fastify.post(
    "/",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.RECORD_PAYMENTS,
        "Puuduvad makse uuendamise õigused.",
      ),
      schema: {
        body: PaymentRecordSchema,
        response: {
          [StatusCodes.CREATED]: SuccessResponse(
            Type.Object({ paymentId: Type.Integer() }),
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(
            Type.Object({ reference: Type.String() }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const paymentId = await recordPayment(userId, request.body);

      if (paymentId === null) {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse({ reference: "Tundmatu viitenumber." }));
      }

      return reply
        .status(StatusCodes.CREATED)
        .send(createSuccessResponse({ paymentId }));
    },
  );
};

export default plugin;
