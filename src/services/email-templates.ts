import prisma from "#app/lib/prisma";
import { escapeHtml } from "#app/lib/html";
import { formatEuros } from "#app/lib/money";

import {
  getEmailRegistrationBodyPost,
  getEmailRegistrationBodyPre,
} from "#app/generated/email-layout";

import type { EmailReceiptInfo } from "#app/routes/api/registrations/registrations.schemas";
import type { BillDocument } from "#app/services/billing/bill-pdf.service";

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

export type ChildInShift = {
  childName: string;
  shiftNr: number;
};

export type ChildOnOtherBill = ChildInShift & { billNr: number };

export const getBillEmail = async (
  bill: BillDocument,
  onOtherBills: ChildOnOtherBill[],
  reserve: ChildInShift[],
) => {
  const billedChildren = new Map<string, ChildInShift>();
  for (const item of bill.items) {
    billedChildren.set(`${item.childName}|${item.shiftNr}`, {
      childName: item.childName,
      shiftNr: item.shiftNr,
    });
  }

  const shifts = new Set(
    [...billedChildren.values(), ...onOtherBills, ...reserve].map(
      (child) => child.shiftNr,
    ),
  );
  const staffContacts = await getStaffContacts([...shifts]);

  const bookingFee = bill.items.reduce((sum, i) => sum + i.bookingFee, 0);
  const total = bill.items.reduce((sum, i) => sum + i.amount, 0);

  const replaces = bill.replaces
    ? `<p>See arve asendab arvet nr ${bill.replaces.number}.</p>`
    : "";

  return `
    <h3>Registreerimise kinnitus!</h3>
    ${getFormattedBilledList([...billedChildren.values()])}
    ${getFormattedOtherBillsList(onOtherBills)}
    ${getFormattedReserveList(reserve)}
    ${replaces}
    <p>Palume üle kanda ka koha broneerimise tasu (või kogu summa) kolme päeva jooksul. Arve leiate manusest.</p>
    <p>Tasuda: ${formatEuros(bookingFee)}. Kogusumma (k.a broneerimistasu): ${formatEuros(total)}.</p>
    <p style="font-family: monospace">MTÜ Noorte Mereklubi<br />Konto: EE862200221011493003<br />SWIFT kood/BIC: HABAEE2X<br />SWEDBANK</p>
    <p style="font-weight: bold">Palume maksmisel kindlasti lisada viitenumber ja selgitusse arve number.</p>
    <p>Kui broneerimistasu pole kolme päeva jooksul meile laekunud, tõstame lapse tagasi reservnimekirja.</p>
    <p>Parimate soovidega</p>
    <p>${staffContacts.html}</p>
    ${getEmailRegistrationBodyPost()}`;
};

const getFormattedBilledList = (children: ChildInShift[]) => {
  let response = "<ul>";
  children.forEach((child) => {
    response += `<li>${escapeHtml(child.childName)} (${child.shiftNr}. vahetus)</li>`;
  });
  response += "</ul>";
  response += "<p>on registreeritud.</p>";
  return response;
};

const getFormattedOtherBillsList = (children: ChildOnOtherBill[]) => {
  if (children.length === 0) return "";

  let response = "<ul>";
  children.forEach((child) => {
    response += `<li>${escapeHtml(child.childName)} (${child.shiftNr}. vahetus)</li>`;
  });
  response += "</ul>";

  const billNrs = [...new Set(children.map((child) => child.billNr))];
  const verb = children.length > 1 ? "olid" : "oli";
  const bills = billNrs.length > 1 ? "arved" : "arve";
  response += `<p>${verb} juba registreeritud (${bills} ${billNrs.join(", ")}).</p>`;
  return response;
};

const getFormattedReserveList = (children: ChildInShift[]) => {
  if (children.length === 0) return "";

  let response = "<ul>";

  children.forEach((child) => {
    response += `<li>${escapeHtml(child.childName)} (${child.shiftNr}. vahetus)</li>`;
  });

  response += "</ul>";
  response +=
    "<p>on reservnimekirjas. Kui põhinimekirjas koht vabaneb, võtame teiega esimesel võimalusel ühendust. " +
    "Palun võtke vahetuse juhatajaga ühendust, kui soovite registreerimise tühistada.</p>";
  return response;
};

const getFormattedChildList = (campers: EmailReceiptInfo[]) => {
  let response = "<ul>";

  campers.forEach((camper) => {
    response += `<li>${escapeHtml(camper.name)} (${camper.shiftNr}. vahetus)</li>`;
  });
  response += "</ul>";

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
