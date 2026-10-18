import type { Transporter } from "nodemailer";

import type { Prisma } from "#app/generated/prisma/client";
import prisma from "#app/lib/prisma";
import { getCurrentCampYear } from "#app/lib/camp-year";
import { fetchShiftsWithPermission } from "#app/lib/permissions";
import { Permissions } from "#app/constants/permissions";
import { buildBillContent } from "#app/services/bill-content.service";
import {
  allocateAccountReference,
  allocateBillNumber,
} from "#app/services/billing-numbers.service";
import {
  billDocumentInclude,
  readBillPdf,
  storeBillPdf,
  type BillDocument,
} from "#app/services/bill-pdf.service";
import MailService from "#app/services/mail.service";

const parentRegistrationSelect = {
  id: true,
  shiftNr: true,
  isRegistered: true,
  isOld: true,
  priceToPay: true,
  contactName: true,
  contactEmail: true,
  child: { select: { name: true } },
  billItem: { select: { bill: { select: { number: true } } } },
} satisfies Prisma.RegistrationSelect;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const fetchParentRegistrations = (email: string) =>
  prisma.registration.findMany({
    where: { contactEmail: email },
    select: parentRegistrationSelect,
    orderBy: { id: "asc" },
  });

const fetchShiftsUserCanBill = (userId: number): Promise<number[]> =>
  fetchShiftsWithPermission(userId, Permissions.SEND_BILLS);

export type IssueBillResult =
  | { status: "unknown-email" }
  | { status: "none-accepted" }
  | { status: "already-billed"; billNr: number }
  | { status: "issued"; bill: BillDocument };

export const issueBill = async (
  userId: number,
  email: string,
): Promise<IssueBillResult> => {
  const senderShifts = await fetchShiftsUserCanBill(userId);

  const registrations = await fetchParentRegistrations(email);
  const inScope = registrations.filter((r) => senderShifts.includes(r.shiftNr));
  if (inScope.length === 0) return { status: "unknown-email" };

  const accepted = inScope.filter((r) => r.isRegistered);
  if (accepted.length === 0) return { status: "none-accepted" };

  const toBill = registrations.filter(
    (r) => r.isRegistered && r.billItem === null,
  );
  if (!toBill.some((r) => senderShifts.includes(r.shiftNr))) {
    const billNrs = accepted.map((r) => r.billItem?.bill.number ?? 0);
    return { status: "already-billed", billNr: Math.max(...billNrs) };
  }

  const shifts = await prisma.shiftInfo.findMany({
    where: { id: { in: toBill.map((r) => r.shiftNr) } },
    select: { id: true, startDate: true, length: true },
  });

  const now = new Date();
  const content = buildBillContent(
    toBill.map((r) => ({
      id: r.id,
      childName: r.child.name,
      shiftNr: r.shiftNr,
      isOld: r.isOld,
      priceToPay: r.priceToPay,
    })),
    new Map(shifts.map((shift) => [shift.id, shift])),
    now,
  );

  const season = getCurrentCampYear();

  // The newest registration has the most up-to-date contact details.
  const newestRegistration = toBill[toBill.length - 1];
  const payerName = newestRegistration.contactName;
  const payerEmail = newestRegistration.contactEmail;
  const accountEmail = normalizeEmail(payerEmail);

  const bill = await prisma.$transaction(async (tx) => {
    const account =
      (await tx.payerAccount.findUnique({
        where: { season_email: { season, email: accountEmail } },
      })) ??
      (await tx.payerAccount.create({
        data: {
          season,
          email: accountEmail,
          contactName: payerName,
          reference: await allocateAccountReference(tx, season),
        },
      }));

    const bill = await tx.bill.create({
      data: {
        number: await allocateBillNumber(tx, season),
        season,
        accountId: account.id,
        payerName,
        payerEmail,
        issuedAt: now,
        bookingFeeDue: content.bookingFeeDue,
        campFeeDue: content.campFeeDue,
        issuedById: userId,
        items: { create: content.items },
      },
      include: billDocumentInclude,
    });

    await storeBillPdf(bill);
    return bill;
  });

  return { status: "issued", bill };
};

const findUnsentBill = async (userId: number, email: string) =>
  prisma.bill.findFirst({
    where: {
      season: getCurrentCampYear(),
      account: { email: normalizeEmail(email) },
      status: "issued",
      sentAt: null,
      items: {
        some: { shiftNr: { in: await fetchShiftsUserCanBill(userId) } },
      },
    },
    orderBy: { number: "desc" },
    include: billDocumentInclude,
  });

export type SendBillResult =
  | Exclude<IssueBillResult, { status: "issued" }>
  | { status: "sent"; billNr: number };

const emailIssuedBill = async (
  mailer: Transporter,
  appUrl: string,
  email: string,
  bill: BillDocument,
): Promise<SendBillResult> => {
  const registrations = await fetchParentRegistrations(email);
  const onOtherBills = registrations.flatMap((r) => {
    const billNr = r.billItem?.bill.number;
    return billNr !== undefined && billNr !== bill.number
      ? [{ childName: r.child.name, shiftNr: r.shiftNr, billNr }]
      : [];
  });
  const reserve = registrations
    .filter((r) => !r.isRegistered)
    .map((r) => ({ childName: r.child.name, shiftNr: r.shiftNr }));

  const claimed = await prisma.bill.updateMany({
    where: { id: bill.id, sentAt: null },
    data: { sentAt: new Date() },
  });
  if (claimed.count === 0) {
    return { status: "already-billed", billNr: bill.number };
  }

  try {
    const pdf = await readBillPdf(bill.number);
    if (!pdf) throw new Error(`The PDF of bill ${bill.number} is missing`);
    await new MailService(mailer, appUrl).sendBill(
      bill,
      pdf,
      onOtherBills,
      reserve,
    );
  } catch (err) {
    await prisma.bill.update({
      where: { id: bill.id },
      data: { sentAt: null },
    });
    throw err;
  }

  return { status: "sent", billNr: bill.number };
};

export const sendBill = async (
  mailer: Transporter,
  appUrl: string,
  userId: number,
  email: string,
): Promise<SendBillResult> => {
  const issued = await issueBill(userId, email);
  if (issued.status === "issued") {
    return emailIssuedBill(mailer, appUrl, email, issued.bill);
  }
  if (issued.status !== "already-billed") return issued;

  const unsent = await findUnsentBill(userId, email);
  return unsent ? emailIssuedBill(mailer, appUrl, email, unsent) : issued;
};

export const getBillPdf = async (
  userId: number,
  billNr: number,
): Promise<Buffer | null> => {
  const bill = await prisma.bill.findUnique({
    where: { number: billNr },
    select: { items: { select: { shiftNr: true } } },
  });
  if (!bill) return null;

  const shifts = await fetchShiftsUserCanBill(userId);
  const canSee = bill.items.some((item) => shifts.includes(item.shiftNr));
  return canSee ? readBillPdf(billNr) : null;
};

export const billingFailureMessage = (
  result: Exclude<IssueBillResult, { status: "issued" }>,
): { email: string } | { registrations: string } => {
  switch (result.status) {
    case "unknown-email":
      return { email: "Tundmatu meiliaadress." };
    case "none-accepted":
      return { registrations: "Registreeritud lapsi pole." };
    case "already-billed":
      return {
        registrations: `Kõik registreeritud lapsed on juba arvel (arve nr ${result.billNr}).`,
      };
  }
};
