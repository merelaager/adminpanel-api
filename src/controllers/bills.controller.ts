import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";
import { generateBillPdf } from "../utils/bill-builder";

import type { Prisma } from "@prisma/client";
import type { JSendResponse } from "../types/jsend";
import type { BillCreationBody } from "../schemas/bill";

interface ICreateBillHandler extends RouteGenericInterface {
  Body: BillCreationBody;
  Reply: JSendResponse;
}

export const createBillHandler = async (
  req: FastifyRequest<ICreateBillHandler>,
  res: FastifyReply<ICreateBillHandler>,
) => {
  const registrationInclude = {
    child: {
      select: { name: true },
    },
  };

  const registrations = await prisma.registration.findMany({
    where: {
      contactEmail: req.body.email,
    },
    include: registrationInclude,
  });

  type CamperBillingInfo = Prisma.RegistrationGetPayload<{
    include: typeof registrationInclude;
  }>;

  if (registrations.length === 0) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        email: "Tundmatu meiliaadress",
      },
    });
  }

  const registeredCampers: CamperBillingInfo[] = [];
  let billTotal = 0;
  let billNr = NaN;

  registrations.forEach((child) => {
    if (isNaN(billNr) && child.billId) billNr = child.billId;
    if (child.isRegistered) {
      registeredCampers.push(child);
      billTotal += child.priceToPay;
    }
  });

  if (registeredCampers.length === 0) {
    return res.status(StatusCodes.NOT_FOUND).send({
      status: "fail",
      data: {
        registrations: "Puuduvad registreeritud lapsed",
      },
    });
  }

  const contact = {
    name: registeredCampers[0].contactName,
    email: registeredCampers[0].contactEmail,
  };

  if (isNaN(billNr)) {
    const newBill = await prisma.bill.create({
      data: {
        contactName: contact.name,
        billTotal: billTotal,
      },
    });

    billNr = newBill.id;

    for (const camper of registeredCampers) {
      await prisma.registration.update({
        where: { id: camper.id },
        data: { billId: billNr },
      });
    }
  }

  const campersBillData = registeredCampers.map((reg) => {
    return {
      name: reg.child.name,
      isOld: reg.isOld,
      shiftNr: reg.shiftNr,
      priceToPay: reg.priceToPay,
    };
  });

  try {
    await generateBillPdf(campersBillData, contact, billNr);
  } catch (err) {
    console.error(err);
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
  //  res.send(`${billName}`, {
  //  root: "./data/arved",
  // });
};
