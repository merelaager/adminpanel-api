import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { requireAnyShiftPermission } from "#app/lib/guards";
import { getSessionUser } from "#app/lib/session";
import { Permissions } from "#app/constants/permissions";
import {
  BinaryResponse,
  createErrorResponse,
  createFailResponse,
  createSuccessResponse,
  ErrorResponseRef,
  FailResponse,
  SuccessResponse,
} from "#app/lib/jsend";
import {
  billingFailureMessage,
  getBillPdf,
  issueBill,
} from "#app/services/billing.service";

import { BillCreationSchema, BillParamsSchema } from "./bills.schemas";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/:billId",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.SEND_BILLS,
        "Puuduvad arve pärimise õigused",
      ),
      schema: {
        params: BillParamsSchema,
        response: {
          [StatusCodes.OK]: BinaryResponse("application/pdf", "The bill PDF."),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(
            Type.Object({ billId: Type.String() }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const pdf = await getBillPdf(userId, request.params.billId);

      if (!pdf) {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse({ billId: "Arvet ei ole olemas." }));
      }

      return reply.status(StatusCodes.OK).type("application/pdf").send(pdf);
    },
  );

  fastify.post(
    "/",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.SEND_BILLS,
        "Puuduvad arve loomise õigused",
      ),
      schema: {
        body: BillCreationSchema,
        response: {
          [StatusCodes.CREATED]: SuccessResponse(
            Type.Object({
              billNr: Type.Integer(),
            }),
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(
            Type.Union([
              Type.Object({ email: Type.String() }),
              Type.Object({ registrations: Type.String() }),
            ]),
          ),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);

      let result;
      try {
        result = await issueBill(userId, request.body.email);
      } catch (err) {
        request.log.error({ err }, "Failed to issue bill");
        return reply
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send(createErrorResponse("Ootamatu viga arve genereerimisel."));
      }

      if (result.status !== "issued") {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse(billingFailureMessage(result)));
      }

      return reply
        .status(StatusCodes.CREATED)
        .send(createSuccessResponse({ billNr: result.bill.number }));
    },
  );
};

export default plugin;
