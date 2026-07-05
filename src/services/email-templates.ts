import prisma from "#app/lib/prisma";
import { escapeHtml } from "#app/lib/html";

import {
  getEmailRegistrationBodyPost,
  getEmailRegistrationBodyPre,
} from "./email-layout";

import type { EmailReceiptInfo } from "#app/routes/api/registrations/registrations.schemas";
import type { CamperBillingInfo } from "#app/services/billing.service";

export const getRegistrationReceipt = async (campers: EmailReceiptInfo[]) => {
  const shifts: number[] = [];

  campers.forEach((camper) => {
    if (!shifts.includes(camper.shiftNr)) shifts.push(camper.shiftNr);
  });

  const staffContacts = await getStaffContacts(shifts);

  // For grammar: is there more than one kid?
  const plural = campers.length > 1;

  const receiptHtml = `
    ${getEmailRegistrationBodyPre()}
    <p>Tere!</p>
    <p>Oleme ${plural ? "lapsed" : "lapse"}</p>
    ${getFormattedChildList(campers)}
    <p>registreerinud reservnimekirja. Kui juhataja koha kinnitab või põhinimekirjas koht vabaneb, võtame Teiega esimesel võimalusel ühendust.</p>
    <p>Parimate soovidega</p>
    <p>${staffContacts.html}</p>
    ${getEmailRegistrationBodyPost()}`;

  return {
    staffEmails: staffContacts.emails,
    html: receiptHtml,
  };
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

  const staffContacts = await getStaffContacts(shifts);

  return `
    <h3>Registreerimise kinnitus!</h3>
    ${getFormattedRegistrationList(regCampers)}
    ${getFormattedReserveList(resCampers)}
    <p>Palume üle kanda ka koha broneerimise tasu (või kogu summa) kolme päeva jooksul. Makseteatise leiate manusest.</p>
    <p>Tasuda: ${100 * regCampers.length} €. Kogusumma (k.a broneerimistasu): ${totalPrice} €.</p>
    <p style="font-family: monospace">MTÜ Noorte Mereklubi<br />Konto: EE862200221011493003<br />SWIFT kood/BIC: HABAEE2X<br />SWEDBANK</p>
    <p style="font-weight: bold">Kindlasti märkige selgitusse lapse nimi ja vahetus!</p>
    <p>Kui broneerimistasu pole kolme päeva jooksul meile laekunud, tõstame lapse tagasi reservnimekirja.</p>
    <p>Parimate soovidega</p>
    <p>${staffContacts.html}</p>
    ${getEmailRegistrationBodyPost()}`;
};

const getFormattedChildList = (campers: EmailReceiptInfo[]) => {
  let response = "<ul>";

  campers.forEach((camper) => {
    response += `<li>${escapeHtml(camper.name)} (${camper.shiftNr}. vahetus)</li>`;
  });
  response += "</ul>";

  return response;
};

const getFormattedRegistrationList = (campers: CamperBillingInfo[]) => {
  if (campers.length === 0) return "";

  let response = "<ul>";

  campers.forEach((camper) => {
    response += `<li>${escapeHtml(camper.child.name)} (${camper.shiftNr}. vahetus)</li>`;
  });

  response += "</ul>";
  response += "<p>on registreeritud.</p>";
  return response;
};

const getFormattedReserveList = (campers: CamperBillingInfo[]) => {
  if (campers.length === 0) return "";

  let response = "<ul>";

  campers.forEach((camper) => {
    response += `<li>${escapeHtml(camper.child.name)} (${camper.shiftNr}. vahetus)</li>`;
  });

  response += "</ul>";
  response +=
    "<p>on reservnimekirjas. Kui põhinimekirjas koht vabaneb, võtame teiega esimesel võimalusel ühendust. " +
    "Palun võtke vahetuse juhatajaga ühendust, kui soovite registreerimise tühistada.</p>";
  return response;
};

const getStaffContacts = async (shiftNumbers: number[]) => {
  const shifts = await prisma.shiftInfo.findMany({
    where: { id: { in: shiftNumbers } },
    select: {
      id: true,
      bossName: true,
      bossEmail: true,
      bossPhone: true,
    },
  });

  return {
    emails: shifts.map((value) => value.bossEmail),
    html: shifts
      .map(
        (shift) =>
          `${escapeHtml(shift.bossName)} (${escapeHtml(shift.bossEmail)}, tel. ${escapeHtml(shift.bossPhone)})`,
      )
      .join(", "),
  };
};
