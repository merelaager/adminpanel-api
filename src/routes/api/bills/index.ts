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
  getBillPdf,
  issueBill,
  reissueBill,
  sendBill,
  type IssueBillResult,
} from "#app/services/billing/billing.service";

import {
  BillingFailureSchema,
  BillParamsSchema,
  ParentEmailSchema,
} from "./bills.schemas";

const billingFailureMessage = (
  result: Exclude<IssueBillResult, { status: "issued" }>,
): { email: string } | { registrations: string } => {
  switch (result.status) {
    case "unknown-email":
      return { email: "Tundmatu meiliaadress." };
    case "none-accepted":
      return { registrations: "Registreeritud lapsi pole." };
    case "already-billed":
      return {
        registrations: `Kõik registreeritud lapsed on juba arvel (arve nr ${result.billNr}).`,
      };
  }
};

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/:billNr",
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
            Type.Object({ billNr: Type.String() }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const pdf = await getBillPdf(userId, request.params.billNr);

      if (!pdf) {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse({ billNr: "Arvet ei ole olemas." }));
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
        body: ParentEmailSchema,
        response: {
          [StatusCodes.CREATED]: SuccessResponse(
            Type.Object({
              billNr: Type.Integer(),
            }),
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(BillingFailureSchema),
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

  fastify.post(
    "/send",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.SEND_BILLS,
        "Puuduvad arve saatmise õigused.",
      ),
      schema: {
        body: ParentEmailSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(
            Type.Object({ billNrs: Type.Array(Type.Integer()) }),
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(BillingFailureSchema),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const { email } = request.body;

      let result;
      try {
        result = await sendBill(
          request.server.mailer,
          request.server.config.APP_URL,
          userId,
          email,
        );
      } catch (err) {
        request.log.error({ err, email }, "Failed to send bill");
        return reply
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send(createErrorResponse("Ootamatu viga arve saatmisel."));
      }

      if (result.status !== "sent") {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse(billingFailureMessage(result)));
      }

      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ billNrs: result.billNrs }));
    },
  );

  fastify.post(
    "/:billNr/reissue",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.REISSUE_BILLS,
        "Puuduvad arve muutmise õigused.",
      ),
      schema: {
        params: BillParamsSchema,
        response: {
          [StatusCodes.CREATED]: SuccessResponse(
            Type.Object({ billNr: Type.Union([Type.Null(), Type.Integer()]) }),
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({ permissions: Type.String() }),
          ),
          [StatusCodes.NOT_FOUND]: FailResponse(
            Type.Object({ billNr: Type.String() }),
          ),
          [StatusCodes.CONFLICT]: FailResponse(
            Type.Object({ billNr: Type.String() }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { userId } = getSessionUser(request);
      const result = await reissueBill(userId, request.params.billNr);

      if (result.status === "not-found") {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse({ billNr: "Arvet ei ole olemas." }));
      }
      if (result.status === "already-void") {
        return reply
          .status(StatusCodes.CONFLICT)
          .send(createFailResponse({ billNr: "Arve on juba tühistatud." }));
      }

      // Null when none of the bill's children are registered any more.
      return reply
        .status(StatusCodes.CREATED)
        .send(createSuccessResponse({ billNr: result.bill?.number ?? null }));
    },
  );
};

export default plugin;
