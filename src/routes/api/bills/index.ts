import fs from "fs";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { requireAnyShiftPermission } from "#app/lib/guards";
import { Permissions } from "#app/constants/permissions";
import {
  createErrorResponse,
  createFailResponse,
  createSuccessResponse,
  ErrorResponseRef,
  FailResponse,
  SuccessResponse,
} from "#app/lib/jsend";
import {
  collectBillableCampers,
  createAndAssignBill,
} from "#app/services/billing.service";

import { BillCreationSchema, BillParamsSchema } from "./bills.schemas";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/:billId",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.EDIT_REGISTRATION_PRICE,
        "Puuduvad arve pärimise õigused",
      ),
      schema: {
        params: BillParamsSchema,
        response: {
          [StatusCodes.OK]: Type.Unknown(),
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
      const billNr = request.params.billId;
      const billPath = `./data/arved/${billNr}.pdf`;

      if (isNaN(billNr) || !fs.existsSync(billPath)) {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse({ billId: "Arvet ei ole olemas." }));
      }

      const stream = fs.createReadStream(billPath);
      reply.status(StatusCodes.OK).type("application/pdf");
      return reply.send(stream);
    },
  );

  fastify.post(
    "/",
    {
      preHandler: requireAnyShiftPermission(
        Permissions.EDIT_REGISTRATION_PRICE,
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
      const billable = await collectBillableCampers(request.body.email);

      if (billable === null) {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createFailResponse({ email: "Tundmatu meiliaadress" }));
      }

      if (billable.registered.length === 0) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            registrations: "Puuduvad registreeritud lapsed",
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
          .send(createErrorResponse("Ootamatu viga arve genereerimisel"));
      }

      return reply
        .status(StatusCodes.CREATED)
        .send(createSuccessResponse({ billNr }));
    },
  );
};

export default plugin;
