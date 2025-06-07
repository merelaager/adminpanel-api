import prisma from "./prisma";

import {
  getEmailRegistrationBodyPost,
  getEmailRegistrationBodyPre,
} from "./email/email-registration-html";

import type { EmailReceiptInfo } from "../schemas/registration";
import type { CamperBillingInfo } from "../controllers/bills.controller";

export const getRegistrationReceipt = async (campers: EmailReceiptInfo[]) => {
  const shifts: number[] = [];

  campers.forEach((camper) => {
    if (!shifts.includes(camper.shiftNr)) shifts.push(camper.shiftNr);
  });

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
    <p>registreerinud reservnimekirja. Kui juhataja koha kinnitab või põhinimekirjas koht vabaneb, võtame Teiega esimesel võimalusel ühendust.</p>
    <p>Parimate soovidega</p>
    <p>${await getFormattedStaffContacts(shifts)}</p>
    ${getEmailRegistrationBodyPost()}`;
};

export const getConfirmationReceipt = async (
  regCampers: CamperBillingInfo[],
  resCampers: CamperBillingInfo[],
) => {
  let totalPrice: number = 0;
  const shifts: number[] = [];

  const campers = regCampers.concat(resCampers);
  campers.forEach((camper) => {
    if (!shifts.includes(camper.shiftNr)) shifts.push(camper.shiftNr);
    if (camper.isRegistered) totalPrice += camper.priceToPay;
  });

  return `
    <h3>Registreerimise kinnitus!</h3>
    ${getFormattedRegistrationList(regCampers)}
    ${getFormattedReserveList(resCampers)}
    <p>Palume üle kanda ka koha broneerimise tasu (või kogu summa). Laagrikoht saab lõpliku kinnituse, kui makse on meile laekunud kolme päeva jooksul. Makseteatise leiate manusest.</p>
    <p>Tasuda: ${100 * regCampers.length} €. Kogusumma (k.a broneerimistasu): ${totalPrice} €.</p>
    <p style="font-family: monospace">MTÜ Noorte Mereklubi<br />Konto: EE862200221011493003<br />SWIFT kood/BIC: HABAEE2X<br />SWEDBANK</p>
    <p style="font-weight: bold">Kindlasti märkige selgitusse lapse nimi ja vahetus!</p>
    <p>Kui broneerimistasu pole kolme päeva jooksul meile laekunud, tõstame lapse reservnimekirja.</p>
    <p>Parimate soovidega</p>
    <p>${await getFormattedStaffContacts(shifts)}</p>
    ${getEmailRegistrationBodyPost()}`;
};

const getFormattedChildList = (campers: EmailReceiptInfo[]) => {
  let response = "<ul>";

  campers.forEach((camper) => {
    response += `<li>${camper.name} (${camper.shiftNr}. vahetus)</li>`;
  });
  response += "</ul>";

  return response;
};

const getFormattedRegistrationList = (campers: CamperBillingInfo[]) => {
  if (campers.length === 0) return "";

  let response = "<ul>";

  campers.forEach((camper) => {
    response += `<li>${camper.child.name} (${camper.shiftNr}. vahetus)</li>`;
  });

  response += "</ul>";
  response += "<p>on registreeritud.</p>";
  return response;
};

const getFormattedReserveList = (campers: CamperBillingInfo[]) => {
  if (campers.length === 0) return "";

  let response = "<ul>";

  campers.forEach((camper) => {
    response += `<li>${camper.child.name} (${camper.shiftNr}. vahetus)</li>`;
  });

  response += "</ul>";
  response +=
    "<p>on reservnimekirjas. Kui põhinimekirjas koht vabaneb, võtame teiega esimesel võimalusel ühendust. " +
    "Palun võtke vahetuse juhatajaga ühendust, kui soovite registreerimise tühistada.</p>";
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
  shifts.forEach((shift) => {
    contactStrings.push(
      `${shift.bossName} (${shift.bossEmail}, tel. ${shift.bossPhone})`,
    );
  });

  return contactStrings.join(", ");
};
