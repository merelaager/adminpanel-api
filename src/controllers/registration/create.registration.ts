import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { v4 as uuidv4 } from "uuid";
import type { Transporter } from "nodemailer";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";
import { type Child, Prisma } from "@prisma/client";

import MailService from "../../services/mailService";

import prisma from "../../utils/prisma";
import {
  createErrorResponse,
  createFailResponse,
  createSuccessResponse,
} from "../../utils/jsend";

import {
  CreateRegistrationsBody,
  EmailReceiptInfo,
} from "../../schemas/registration";
import { JSendError, JSendResponse } from "../../schemas/jsend";

const validateDate = (year: number, month: number, date: number) => {
  if (month < 0 || month > 11 || date < 0) return false;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return date <= daysInMonth;
};

type IDCodeParseResult = { error: string } | { sex: "M" | "F"; dob: string };

const parseIdCode = (code: string): IDCodeParseResult => {
  if (code.length !== 11 || !/^\d+$/.test(code)) {
    return { error: "ID code must be 11 digits long" };
  }

  if (code[0] !== "5" && code[0] !== "6") {
    return { error: "Child's ID code must start with 5 or 6" };
  }
  const birthYear = parseInt(`20${code[1]}${code[2]}`, 10);
  const birthMonth = parseInt(`${code[3]}${code[4]}`, 10);
  const birthDate = parseInt(`${code[5]}${code[6]}`, 10);

  // Month for the Date constructor.
  const birthMonthIndex = birthMonth - 1;

  if (!validateDate(birthYear, birthMonthIndex, birthDate)) {
    return { error: "ID code does not contain a valid date of birth" };
  }

  const dob = new Date(
    Date.UTC(birthYear, birthMonthIndex, birthDate),
  ).toISOString();

  // TODO: check the ID code checksum.
  // Counterpoint: on rare occasions, legal ID codes have invalid checksums.

  const sex: "M" | "F" = code[0] === "5" ? "M" : "F";
  return { sex, dob };
};

const computePrice = (shiftNr: number, isOld: boolean) => {
  // TODO: fetch price dynamically.
  const shiftPrices = [250, 360, 360, 360];
  const seniorityDiscounts = [10, 20, 20, 20];

  // This should never happen.
  if (shiftNr < 1 || shiftNr > shiftPrices.length) {
    return -1;
  }

  // The shift number is 1-indexed.
  let price = shiftPrices[shiftNr - 1];
  if (isOld) price -= seniorityDiscounts[shiftNr - 1];
  return price;
};

export const FormRegistrationData = Type.Object({
  registrationId: Type.String(),
});

export const FormRegistrationFailData = Type.Record(
  Type.String(),
  Type.String(),
);

interface IFormRegistrationHandler extends RouteGenericInterface {
  Body: CreateRegistrationsBody;
  Reply:
    | JSendResponse<
        typeof FormRegistrationData,
        typeof FormRegistrationFailData
      >
    | JSendError;
}

export const formRegistrationHandler = async (
  req: FastifyRequest<IFormRegistrationHandler>,
  res: FastifyReply<IFormRegistrationHandler>,
): Promise<never> => {
  const { mailer, regorder } = req.server;
  const registrations = req.body;

  const registrationId = uuidv4();

  const maxEntries = 4;
  if (registrations.length > maxEntries) {
    return res.status(StatusCodes.BAD_REQUEST).send(
      createFailResponse({
        registrations: `The number of entries must not exceed ${maxEntries}`,
      }),
    );
  }

  // Keep track of the relative order of registrations.
  // Order numbers are wasted if the registration fails (e.g. the request is malformed),
  // but this is not a problem for the current use case, and it avoids looping twice.
  const currentOrder = regorder.getOrder();

  const registrationEntries: Prisma.RegistrationCreateManyInput[] = [];

  // Helpers for email receipts.
  const camperBasicInfo: EmailReceiptInfo[] = [];
  const registrationEmailChoices: boolean[] = [];

  for (const [index, entry] of registrations.entries()) {
    let { sex, dob } = entry;

    // The ID code takes priority over explicit sex and birthday info.
    if (entry.idCode) {
      const parsedData = parseIdCode(entry.idCode);
      if ("error" in parsedData) {
        return res.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            [`[${index}].idCode`]: parsedData.error,
          }),
        );
      }

      // Override the sex and birthday info even if set.
      sex = parsedData.sex;
      dob = parsedData.dob;
    } else if (sex === undefined || dob === undefined) {
      // These should not be undefined since the request body has been validated.
      // But check in any case.
      const failData: { [key: string]: string } = {};
      if (!sex) failData[`[${index}].sex`] = "property is required";
      if (!dob) failData[`[${index}].dob`] = "property is required";

      return res
        .status(StatusCodes.BAD_REQUEST)
        .send(createFailResponse(failData));
    }

    const childName = entry.name.trim().replace(/\s+/g, " ");
    const birthYear = new Date(dob).getFullYear();
    const idCode = entry.idCode ? entry.idCode : null;

    let childInstance: Child | null = null;

    // As a first resort, try to use the ID code to check whether the child
    // is already known in the camp database.
    if (idCode !== null) {
      childInstance = await prisma.child.findUnique({
        where: { idCode },
      });

      if (childInstance !== null) {
        if (childInstance.name !== childName) {
          console.warn(
            "Overwriting name",
            childInstance.name,
            "of",
            childInstance.id,
            "with",
            childInstance.name,
          );
          await prisma.child.update({
            where: { id: childInstance.id },
            data: { name: childName },
          });
        }

        // This should never happen, but better safe than sorry!
        if (childInstance.birthYear && childInstance.birthYear !== birthYear) {
          console.warn(
            "ID code matches for ID code:",
            entry.idCode,
            "childId:",
            childInstance.id,
            "but the birth year is different",
          );
        }
      }
    }

    // If the child was not found, then attempt to find one by name.
    if (childInstance === null) {
      childInstance = await prisma.child.findFirst({
        where: { name: childName, sex },
      });

      if (childInstance !== null) {
        if (childInstance.birthYear && childInstance.birthYear !== birthYear) {
          console.warn(
            "Found match for child with name:",
            childInstance.name,
            `(childId: ${childInstance.id})`,
            "with different year of birth:",
            childInstance.birthYear,
            "vs",
            birthYear,
          );
        }
      }
    }

    const knownChild = childInstance !== null;

    // Finally, if no child instance was found,
    // assume that the child is not known and create a new entry.
    if (childInstance === null) {
      childInstance = await prisma.child.create({
        data: { name: childName, sex, birthYear, idCode },
      });
    }

    // TODO: check that the shift number exists.
    const isOld = !entry.isNew;

    // TODO: get rid of this check once shift number checking is implemented.
    // Here we know that the priceToPay must exist, as we compute it.
    let priceToPay = computePrice(entry.shiftNr, isOld);
    if (priceToPay < 0) {
      priceToPay = 360;
      console.error(entry, "Invalid shift identifier");
    }

    const registrationEntry: Prisma.RegistrationCreateManyInput = {
      regOrder: currentOrder,
      regId: registrationId,
      childId: childInstance.id,
      idCode: entry.idCode || null,
      shiftNr: entry.shiftNr,
      isOld: isOld,
      birthday: dob,
      tsSize: entry.shirtSize,
      addendum: entry.addendum?.trim() || null,
      road: entry.road.trim(),
      city: entry.city.trim(),
      county: entry.county.trim(),
      country: entry.country.trim(),
      contactName: entry.contactName.trim(),
      contactNumber: entry.contactNumber.trim(),
      contactEmail: entry.contactEmail.trim(),
      backupTel: entry.backupTel?.trim() || null,
      priceToPay: priceToPay,
    };

    // Do not double include the child in the list for that shift.
    // However, we must not leak whether the child is already in the list.
    if (knownChild) {
      const existingRegistration = await prisma.registration.findFirst({
        where: {
          childId: childInstance.id,
          shiftNr: entry.shiftNr,
        },
      });
      if (existingRegistration !== null) {
        registrationEntry.visible = false;
      }
    }

    registrationEntries.push(registrationEntry);
    camperBasicInfo.push({
      name: entry.name,
      shiftNr: entry.shiftNr,
      contactEmail: entry.contactEmail,
      registrationId: registrationId,
    });
    registrationEmailChoices.push(entry.sendEmail ?? false);
  }

  try {
    await prisma.registration.createMany({
      data: registrationEntries,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send(createErrorResponse("Error communicating with the database"));
  }

  if (registrationEmailChoices.includes(true)) {
    await sendRegistrationEmails(
      camperBasicInfo,
      registrationEmailChoices,
      mailer,
    );
  }

  return res
    .status(StatusCodes.CREATED)
    .send(createSuccessResponse({ registrationId }));
};

const sendRegistrationEmails = async (
  registrations: EmailReceiptInfo[],
  emailChoices: boolean[],
  mailer: Transporter,
) => {
  // Group children by email.
  const childContacts: {
    [key: string]: EmailReceiptInfo[];
  } = {};

  // Determine which children to send an email about.
  // The API allows specifying that an email should not
  // be sent for a particular registration.
  for (const [index, registration] of registrations.entries()) {
    if (!emailChoices[index]) continue;

    const { contactEmail } = registration;
    if (!(contactEmail in childContacts)) {
      childContacts[contactEmail] = [registration];
    } else {
      childContacts[contactEmail].push(registration);
    }
  }

  const mailService = new MailService(mailer);

  for (const [email, entries] of Object.entries(childContacts)) {
    try {
      await mailService.sendRegistrationReceipt(entries, email);
    } catch (err) {
      console.error("Email was", email);
      console.error(err);
    }
  }
};
