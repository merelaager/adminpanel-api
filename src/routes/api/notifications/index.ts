import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { requireAnyShiftPermission } from "#app/lib/guards";
import { Permissions } from "#app/constants/permissions";
import {
  createErrorResponse,
  createFailResponse,
  ErrorResponseRef,
  FailResponse,
} from "#app/lib/jsend";
import {
  collectBillableCampers,
  createAndAssignBill,
} from "#app/services/billing.service";

import { SingleBillSendSchema } from "./notifications.schemas";
import { sendBillNotification } from "./notifications.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/bills",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.EDIT_REGISTRATION_PRICE,
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
      const email = request.body.email;

      const billable = await collectBillableCampers(email);

      if (billable === null) {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse({ email: "Tundmatu meiliaadress." }));
      }

      if (billable.registered.length === 0) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            registrations: "Puuduvad registreeritud lapsed.",
          }),
        );
      }

      let billNr: number;
      try {
        billNr = await createAndAssignBill(
          billable.billNr,
          billable.billTotal,
          billable.registered,
        );
      } catch (err) {
        request.log.error({ err }, "Failed to create and assign bill");
        return reply
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send(createErrorResponse("Ootamatu viga arve genereerimisel."));
      }

      try {
        await sendBillNotification(
          request.server.mailer,
          request.server.config.APP_URL,
          email,
          billNr,
          billable.registered,
          billable.reserve,
          billable.registeredIds,
        );
      } catch (err) {
        request.log.error({ err, email }, "Failed to send bill email");
        return reply
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send(createErrorResponse("Ootamatu viga arve saatmisel."));
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
