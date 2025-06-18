import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../../utils/prisma";
import { isUserBoss } from "../../utils/permissions";

import MailService from "../../services/mailService";

import {
  CamperBillingInfo,
  createAndAssignBill,
  registrationInclude,
} from "../bills.controller";

import type { SingleBillSendBody } from "../../schemas/shift";
import type { JSendResponse } from "../../types/jsend";

interface ISendBillHandler extends RouteGenericInterface {
  Body: SingleBillSendBody;
  Reply: JSendResponse;
}

export const sendBillHandler = async (
  req: FastifyRequest<ISendBillHandler>,
  res: FastifyReply<ISendBillHandler>,
) => {
  const { userId } = req.session.user;
  const email = req.body.email;

  // Since bills can contain data about campers in many shifts
  // being a boss of one shift is enough to allow the sending of bills.
  if (!(await isUserBoss(userId))) {
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
    console.error(err);
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
    console.error("Email was", email);
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
      status: "error",
      message: "Ootamatu viga arve saatmise.",
    });
  }

  return res.status(StatusCodes.NO_CONTENT).send();
};
