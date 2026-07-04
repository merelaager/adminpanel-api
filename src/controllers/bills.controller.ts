import fs from "fs";
import { ReadStream } from "node:fs";
import { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";

import { canEditRegistrationPriceAnyShift } from "#app/lib/permissions";
import { getSessionUser } from "#app/lib/session";
import {
  collectBillableCampers,
  createAndAssignBill,
} from "#app/services/billing.service";

import type { JSendError, JSendResponse } from "#app/lib/jsend";
import { UnknownData } from "#app/lib/jsend";
import { BillCreationSchema, BillParamsSchema } from "#app/schemas/bill";
import type { Route } from "#app/schemas/route";

type ICreateBillHandler = Route<{ body: typeof BillCreationSchema }> & {
  Reply: JSendResponse<typeof UnknownData, typeof UnknownData> | JSendError;
};

export const createBillHandler = async (
  req: FastifyRequest<ICreateBillHandler>,
  res: FastifyReply<ICreateBillHandler>,
) => {
  const { userId } = getSessionUser(req);

  if (!(await canEditRegistrationPriceAnyShift(userId))) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: {
        permissions: "Puuduvad arve loomise õigused",
      },
    });
  }

  const billable = await collectBillableCampers(req.body.email);

  if (billable === null) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        email: "Tundmatu meiliaadress",
      },
    });
  }

  if (billable.registered.length === 0) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        registrations: "Puuduvad registreeritud lapsed",
      },
    });
  }

  let billNr: number;
  try {
    billNr = await createAndAssignBill(
      billable.billNr,
      billable.billTotal,
      billable.registered,
    );
  } catch (err) {
    req.log.error({ err }, "Failed to create and assign bill");
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Ootamatu viga arve genereerimisel",
    });
  }

  return res.status(StatusCodes.CREATED).send({
    status: "success",
    data: {
      billNr: billNr,
    },
  });
};

type IFetchBillHandler = Route<{ params: typeof BillParamsSchema }> & {
  Reply: JSendResponse<typeof UnknownData, typeof UnknownData> | ReadStream;
};

export const fetchBillHandler = async (
  req: FastifyRequest<IFetchBillHandler>,
  res: FastifyReply<IFetchBillHandler>,
) => {
  const { userId } = getSessionUser(req);

  if (!(await canEditRegistrationPriceAnyShift(userId))) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: {
        permissions: "Puuduvad arve pärimise õigused",
      },
    });
  }

  const billNr = req.params.billId;
  const billPath = `./data/arved/${billNr}.pdf`;

  if (isNaN(billNr) || !fs.existsSync(billPath)) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        billId: "Arvet ei ole olemas.",
      },
    });
  }

  const stream = fs.createReadStream(billPath);
  res.status(StatusCodes.OK).type("application/pdf");
  return res.send(stream);
};
