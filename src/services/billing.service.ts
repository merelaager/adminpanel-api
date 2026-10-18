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

type ParentRegistration = Prisma.RegistrationGetPayload<{
  select: typeof parentRegistrationSelect;
}>;

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

const fetchParentRegistrations = (email: string) =>
  prisma.registration.findMany({
    where: { contactEmail: email },
    select: parentRegistrationSelect,
    orderBy: { id: "asc" },
  });

const fetchShiftsUserCanBill = (userId: number): Promise<number[]> =>
  fetchShiftsWithPermission(userId, Permissions.SEND_BILLS);

type NewBill = {
  season: number;
  accountId: number;
  payerName: string;
  payerEmail: string;
  issuedById: number;
  replacesId?: number;
  registrations: ParentRegistration[];
};

const createBill = async (
  tx: Prisma.TransactionClient,
  { registrations, ...bill }: NewBill,
): Promise<BillDocument> => {
  const shifts = await tx.shiftInfo.findMany({
    where: { id: { in: registrations.map((r) => r.shiftNr) } },
    select: { id: true, startDate: true, length: true },
  });

  const now = new Date();
  const content = buildBillContent(
    registrations.map((r) => ({
      id: r.id,
      childName: r.child.name,
      shiftNr: r.shiftNr,
      isOld: r.isOld,
      priceToPay: r.priceToPay,
    })),
    new Map(shifts.map((shift) => [shift.id, shift])),
    now,
  );

  const created = await tx.bill.create({
    data: {
      ...bill,
      number: await allocateBillNumber(tx, bill.season),
      issuedAt: now,
      bookingFeeDue: content.bookingFeeDue,
      campFeeDue: content.campFeeDue,
      items: { create: content.items },
    },
    include: billDocumentInclude,
  });

  await storeBillPdf(created);
  return created;
};

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

    return createBill(tx, {
      season,
      accountId: account.id,
      payerName,
      payerEmail,
      issuedById: userId,
      registrations: toBill,
    });
  });

  return { status: "issued", bill };
};

export type ReissueBillResult =
  | { status: "not-found" }
  | { status: "already-void" }
  | { status: "reissued"; bill: BillDocument | null };

// Voids the bill and generates a new one with updated prices.
// If no children are still registered, the bill is voided.
export const reissueBill = async (
  userId: number,
  billNr: number,
): Promise<ReissueBillResult> => {
  const old = await prisma.bill.findUnique({ where: { number: billNr } });
  if (!old) return { status: "not-found" };

  return prisma.$transaction(async (tx): Promise<ReissueBillResult> => {
    const voided = await tx.bill.updateMany({
      where: { id: old.id, status: "issued" },
      data: { status: "void", voidedAt: new Date() },
    });
    if (voided.count === 0) return { status: "already-void" };

    const registrations = await tx.registration.findMany({
      where: { billItem: { billId: old.id }, isRegistered: true },
      select: parentRegistrationSelect,
      orderBy: { id: "asc" },
    });
    await tx.billItem.updateMany({
      where: { billId: old.id },
      data: { registrationId: null },
    });
    if (registrations.length === 0) return { status: "reissued", bill: null };

    const bill = await createBill(tx, {
      season: old.season,
      accountId: old.accountId,
      payerName: old.payerName,
      payerEmail: old.payerEmail,
      issuedById: userId,
      replacesId: old.id,
      registrations,
    });
    return { status: "reissued", bill };
  });
};

const findUnsentBills = async (userId: number, email: string) =>
  prisma.bill.findMany({
    where: {
      season: getCurrentCampYear(),
      account: { email: normalizeEmail(email) },
      status: "issued",
      sentAt: null,
      items: {
        some: { shiftNr: { in: await fetchShiftsUserCanBill(userId) } },
      },
    },
    orderBy: { number: "asc" },
    include: billDocumentInclude,
  });

export type SendBillResult =
  | Exclude<IssueBillResult, { status: "issued" }>
  | { status: "sent"; billNrs: number[] };

const emailIssuedBill = async (
  mailer: Transporter,
  appUrl: string,
  email: string,
  bill: BillDocument,
): Promise<boolean> => {
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
  if (claimed.count === 0) return false;

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

  return true;
};

export const sendBill = async (
  mailer: Transporter,
  appUrl: string,
  userId: number,
  email: string,
): Promise<SendBillResult> => {
  const issued = await issueBill(userId, email);
  if (issued.status === "unknown-email" || issued.status === "none-accepted") {
    return issued;
  }

  const billNrs: number[] = [];
  for (const bill of await findUnsentBills(userId, email)) {
    if (await emailIssuedBill(mailer, appUrl, email, bill)) {
      billNrs.push(bill.number);
    }
  }

  if (billNrs.length > 0) return { status: "sent", billNrs };
  if (issued.status === "already-billed") return issued;
  return { status: "already-billed", billNr: issued.bill.number };
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
