import fs from "fs";
import { ReadStream } from "node:fs";
import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";
import { Prisma } from "@prisma/client";

import prisma from "../utils/prisma";
import { isUserBoss } from "../utils/permissions";
import { generateBillPdf } from "../utils/bill-builder";

import type { JSendResponse } from "../types/jsend";
import type { BillCreationBody } from "../schemas/bill";

export const registrationInclude = {
  child: {
    select: { name: true },
  },
};

export type CamperBillingInfo = Prisma.RegistrationGetPayload<{
  include: typeof registrationInclude;
}>;

const createBillDatabaseEntry = async (
  contactName: string,
  billTotal: number,
) => {
  const newBill = await prisma.bill.create({
    data: { contactName, billTotal },
  });
  return newBill.id;
};

export const createAndAssignBill = async (
  billNr: number,
  billTotal: number,
  registeredCampers: CamperBillingInfo[],
) => {
  const contact = {
    name: registeredCampers[0].contactName,
    email: registeredCampers[0].contactEmail,
  };

  if (isNaN(billNr)) {
    billNr = await createBillDatabaseEntry(contact.name, billTotal);

    for (const camper of registeredCampers) {
      if (camper.billId) continue; // No unnecessary updates.
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

  await generateBillPdf(campersBillData, contact, billNr);
  return billNr;
};

interface ICreateBillHandler extends RouteGenericInterface {
  Body: BillCreationBody;
  Reply: JSendResponse;
}

export const createBillHandler = async (
  req: FastifyRequest<ICreateBillHandler>,
  res: FastifyReply<ICreateBillHandler>,
) => {
  const { userId } = req.session.user;

  if (!(await isUserBoss(userId))) {
    return res.status(StatusCodes.FORBIDDEN).send({
      status: "fail",
      data: {
        permissions: "Puuduvad arve loomise õigused",
      },
    });
  }

  const registrations = await prisma.registration.findMany({
    where: {
      contactEmail: req.body.email,
    },
    include: registrationInclude,
  });

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

  try {
    await createAndAssignBill(billNr, billTotal, registeredCampers);
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
};

interface IFetchBillHandler extends RouteGenericInterface {
  Params: { billId: number };
  Reply: JSendResponse | ReadStream;
}

export const fetchBillHandler = async (
  req: FastifyRequest<IFetchBillHandler>,
  res: FastifyReply<IFetchBillHandler>,
) => {
  const { userId } = req.session.user;

  if (!(await isUserBoss(userId))) {
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
