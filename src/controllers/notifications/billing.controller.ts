import { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "#app/utils/prisma";
import { canEditRegistrationPriceAnyShift } from "#app/utils/permissions";
import { getSessionUser } from "#app/utils/session";

import MailService from "#app/services/mailService";

import {
  CamperBillingInfo,
  createAndAssignBill,
  registrationInclude,
} from "#app/controllers/bills.controller";

import { SingleBillSendSchema } from "#app/schemas/shift";
import type { JSendError, JSendResponse } from "#app/schemas/jsend";
import { UnknownData } from "#app/schemas/jsend";
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

  const registrations = await prisma.registration.findMany({
    where: {
      contactEmail: email,
    },
    include: registrationInclude,
  });

  if (registrations.length === 0) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        email: "Tundmatu meiliaadress.",
      },
    });
  }

  const regCampers: CamperBillingInfo[] = [];
  const resCampers: CamperBillingInfo[] = [];
  const notifiedRegistrationIDs: number[] = [];

  let billTotal = 0;
  let billNr = NaN;

  registrations.forEach((registration) => {
    if (registration.isRegistered) {
      if (isNaN(billNr) && registration.billId) billNr = registration.billId;
      regCampers.push(registration);
      notifiedRegistrationIDs.push(registration.id);
      billTotal += registration.priceToPay;
    } else resCampers.push(registration);
  });

  if (regCampers.length === 0) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        registrations: "Puuduvad registreeritud lapsed.",
      },
    });
  }

  try {
    billNr = await createAndAssignBill(billNr, billTotal, regCampers);
  } catch (err) {
    req.log.error({ err }, "Failed to create and assign bill");
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Ootamatu viga arve genereerimisel.",
    });
  }

  const mailService = new MailService(req.server.mailer);
  try {
    await mailService.sendBill(email, billNr, regCampers, resCampers);

    await prisma.registration.updateMany({
      where: {
        id: { in: notifiedRegistrationIDs },
      },
      data: {
        notifSent: true,
      },
    });
  } catch (err) {
    req.log.error({ err, email }, "Failed to send bill email");
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Ootamatu viga arve saatmise.",
    });
  }

  return res.status(StatusCodes.NO_CONTENT).send(null);
};
