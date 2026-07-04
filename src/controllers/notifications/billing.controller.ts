import { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "#app/lib/prisma";
import { canEditRegistrationPriceAnyShift } from "#app/lib/permissions";
import { getSessionUser } from "#app/lib/session";

import MailService from "#app/services/mail.service";
import {
  collectBillableCampers,
  createAndAssignBill,
} from "#app/services/billing.service";

import { SingleBillSendSchema } from "#app/schemas/shift";
import type { JSendError, JSendResponse } from "#app/lib/jsend";
import { UnknownData } from "#app/lib/jsend";
import type { Route } from "#app/schemas/route";

type ISendBillHandler = Route<{ body: typeof SingleBillSendSchema }> & {
  Reply:
    | JSendResponse<typeof UnknownData, typeof UnknownData>
    | JSendError
    | null;
};

export const sendBillHandler = async (
  req: FastifyRequest<ISendBillHandler>,
  res: FastifyReply<ISendBillHandler>,
) => {
  const { userId } = getSessionUser(req);
  const email = req.body.email;

  // Since bills can contain data about campers in many shifts,
  // having registration price edit permissions for any one shift is enough
  // to allow the sending of bills.
  if (!(await canEditRegistrationPriceAnyShift(userId))) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: {
        permissions: "Puuduvad arve saatmise õigused.",
      },
    });
  }

  const billable = await collectBillableCampers(email);

  if (billable === null) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        email: "Tundmatu meiliaadress.",
      },
    });
  }

  if (billable.registered.length === 0) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        registrations: "Puuduvad registreeritud lapsed.",
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
      message: "Ootamatu viga arve genereerimisel.",
    });
  }

  const mailService = new MailService(
    req.server.mailer,
    req.server.config.APP_URL,
  );
  try {
    await mailService.sendBill(
      email,
      billNr,
      billable.registered,
      billable.reserve,
    );

    await prisma.registration.updateMany({
      where: {
        id: { in: billable.registeredIds },
      },
      data: {
        notifSent: true,
      },
    });
  } catch (err) {
    req.log.error({ err, email }, "Failed to send bill email");
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Ootamatu viga arve saatmisel.",
    });
  }

  return res.status(StatusCodes.NO_CONTENT).send(null);
};
