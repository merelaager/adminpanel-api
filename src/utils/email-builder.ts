import prisma from "./prisma";

import {
  getEmailRegistrationBodyPost,
  getEmailRegistrationBodyPre,
} from "./email/email-registration-html";

import { EmailReceiptInfo } from "../schemas/registration";

export const getRegistrationReceipt = async (campers: EmailReceiptInfo[]) => {
  const shifts: number[] = [];

  for (const camper of campers) {
    if (!shifts.includes(camper.shiftNr)) shifts.push(camper.shiftNr);
  }

  // For grammar: is there more than one kid?
  const plural = campers.length > 1;

  /*
  // For grammar, is there more than one kid per shift?
  let singleShift = true;
  if (plural) {
    const seenShifts: number[] = [];
    for (const camper of campers) {
      if (!seenShifts.includes(camper.shiftNr)) {
        singleShift = false;
        break;
      }
      seenShifts.push(camper.shiftNr);
    }
  }
  */

  return `
    ${getEmailRegistrationBodyPre()}
    <p>Tere!</p>
    <p>Oleme ${plural ? "lapsed" : "lapse"}</p>
    ${getFormattedChildList(campers)}
    <p>registreerinud reservnimekirja. Kui juhtaja koha kinnitab või põhinimekirjas koht vabaneb, võtame Teiega esimesel võimalusel ühendust.</p>
    <p>Parimate soovidega</p>
    <p>${await getFormattedStaffContacts(shifts)}</p>
    ${getEmailRegistrationBodyPost()}`;
};

const getFormattedChildList = (campers: EmailReceiptInfo[]) => {
  let response = "<ul>";

  for (const camper of campers) {
    response += `<li>${camper.name} (${camper.shiftNr}. vahetus)</li>`;
  }
  response += "</ul>";

  return response;
};

const getFormattedStaffContacts = async (shiftNumbers: number[]) => {
  const shifts = await prisma.shiftInfo.findMany({
    where: { id: { in: shiftNumbers } },
    select: {
      id: true,
      bossName: true,
      bossEmail: true,
      bossPhone: true,
    },
  });

  const contactStrings: string[] = [];
  for (const shift of shifts) {
    contactStrings.push(
      `${shift.bossName} (${shift.bossEmail}, tel. ${shift.bossPhone})`,
    );
  }

  return contactStrings.join(", ");
};
