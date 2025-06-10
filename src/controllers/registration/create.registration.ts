import { Prisma, PrismaClient } from "@prisma/client";
import { Transporter } from "nodemailer";
import { StatusCodes } from "http-status-codes";

import MailService from "../../services/mailService";

import {
  CreateRegistrationData,
  EmailReceiptInfo,
} from "../../schemas/registration";

import type { JSendResponse } from "../../types/jsend";
import type { TRegOrder } from "../../plugins/app/regorder";

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
  const shiftPrices = [290, 350, 350, 350];
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

type RegistrationResult = {
  ok: boolean;
  code: StatusCodes;
  response: JSendResponse;
};

export const createRegistrationFromParentData = async (
  registrations: CreateRegistrationData[],
  prisma: PrismaClient,
  mailer: Transporter,
  regorder: TRegOrder,
): Promise<RegistrationResult> => {
  const resObj = <JSendResponse>{
    status: "success",
    data: null,
  };

  const maxEntries = 8;
  if (registrations.length > maxEntries) {
    resObj.status = "fail";
    resObj.data = {
      registrations: `The number of entries must not exceed ${maxEntries}`,
    };
    return {
      ok: false,
      code: StatusCodes.BAD_REQUEST,
      response: resObj,
    };
  }

  // Keep track of the relative order of registrations.
  // Order numbers are wasted if the registration fails (e.g. the request is malformed)
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
        resObj.status = "fail";
        resObj.data = {};
        resObj.data[`[${index}].idCode`] = parsedData.error;

        return {
          ok: false,
          code: StatusCodes.BAD_REQUEST,
          response: resObj,
        };
      }

      // Override the sex and birthday info even if set.
      sex = parsedData.sex;
      dob = parsedData.dob;
    } else if (sex === undefined || dob === undefined) {
      // These should not be undefined since the request body has been validated.
      // But check in any case.
      resObj.status = "fail";
      resObj.data = {};
      if (!sex) resObj.data[`[${index}].sex`] = "property is required";
      if (!dob) resObj.data[`[${index}].dob`] = "property is required";

      return {
        ok: false,
        code: StatusCodes.BAD_REQUEST,
        response: resObj,
      };
    }

    const childName = entry.name.trim().replace(/\s+/g, " ");
    const childInstance = await prisma.child.create({
      data: {
        name: childName,
        sex: sex,
      },
    });

    // TODO: check that the shift number exists.
    const isOld = !entry.isNew;

    // TODO: get rid of this check once shift number checking is implemented.
    // Here we know that the priceToPay must exist, as we compute it.
    let priceToPay = computePrice(entry.shiftNr, isOld);
    if (priceToPay < 0) {
      priceToPay = 350;
      console.error(entry, "Invalid shift identifier");
    }

    const registrationEntry: Prisma.RegistrationCreateManyInput = {
      regOrder: currentOrder,
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

    registrationEntries.push(registrationEntry);
    camperBasicInfo.push({
      name: entry.name,
      shiftNr: entry.shiftNr,
      contactEmail: entry.contactEmail,
    });
    registrationEmailChoices.push(entry.sendEmail ?? false);
  }

  let createMany: Prisma.BatchPayload;
  try {
    createMany = await prisma.registration.createMany({
      data: registrationEntries,
    });
  } catch (err) {
    console.error(err);
    const resErrObj = <JSendResponse>{
      status: "error",
      message: "Error communicating with database",
    };
    return {
      ok: false,
      code: StatusCodes.INTERNAL_SERVER_ERROR,
      response: resErrObj,
    };
  }

  if (registrationEmailChoices.includes(true)) {
    await sendRegistrationEmails(
      camperBasicInfo,
      registrationEmailChoices,
      mailer,
    );
  }

  resObj.data = { createMany };
  return {
    ok: true,
    code: StatusCodes.CREATED,
    response: resObj,
  };
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
