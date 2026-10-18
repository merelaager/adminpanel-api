import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { requireAnyShiftPermission } from "#app/lib/guards";
import { getSessionUser } from "#app/lib/session";
import { Permissions } from "#app/constants/permissions";
import {
  createErrorResponse,
  createFailResponse,
  ErrorResponseRef,
  FailResponse,
} from "#app/lib/jsend";
import { billingFailureMessage, sendBill } from "#app/services/billing.service";

import { SingleBillSendSchema } from "./notifications.schemas";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/bills",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.SEND_BILLS,
        "Puuduvad arve saatmise õigused.",
      ),
      schema: {
        body: SingleBillSendSchema,
        response: {
          [StatusCodes.NO_CONTENT]: {},
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

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
