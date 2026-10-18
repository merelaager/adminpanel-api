import type { Prisma } from "#app/generated/prisma/client";
import prisma from "#app/lib/prisma";
import { startOfUTCDay } from "#app/lib/date";
import type {
  BillStatus,
  BillSummary,
} from "#app/routes/api/bills/bills.schemas";

export type BillForStatus = {
  voidedAt: Date | null;
  bookingFeeDue: Date;
  campFeeDue: Date;
  items: { amount: number; bookingFee: number }[];
};

export type BillStanding = {
  status: BillStatus;
  paidCents: number;
  totalCents: number;
};

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const totalOf = (bill: BillForStatus) => sum(bill.items.map((i) => i.amount));
const bookingFeeOf = (bill: BillForStatus) =>
  sum(bill.items.map((i) => i.bookingFee));

const statusOf = (
  bill: BillForStatus,
  paid: number,
  today: Date,
): BillStatus => {
  if (bill.voidedAt !== null) return "void";
  if (paid >= totalOf(bill)) return "paid";
  if (bill.campFeeDue < today) return "camp-fee-overdue";
  if (bill.bookingFeeDue < today && paid < bookingFeeOf(bill)) {
    return "booking-fee-overdue";
  }
  return "open";
};

export const computeBillStandings = (
  bills: readonly BillForStatus[],
  paidTotal: number,
  now: Date,
): BillStanding[] => {
  const parts = bills
    .flatMap((bill, i) =>
      bill.voidedAt === null
        ? [
            { i, due: bill.bookingFeeDue, amount: bookingFeeOf(bill) },
            {
              i,
              due: bill.campFeeDue,
              amount: totalOf(bill) - bookingFeeOf(bill),
            },
          ]
        : [],
    )
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  const paid = bills.map(() => 0);
  let remaining = Math.max(0, paidTotal);
  for (const part of parts) {
    const amount = Math.min(remaining, part.amount);
    paid[part.i] += amount;
    remaining -= amount;
  }

  const today = startOfUTCDay(now);
  return bills.map((bill, i) => ({
    status: statusOf(bill, paid[i], today),
    paidCents: paid[i],
    totalCents: totalOf(bill),
  }));
};

const accountBillingSelect = {
  reference: true,
  contactName: true,
  email: true,
  bills: {
    select: {
      id: true,
      number: true,
      voidedAt: true,
      sentAt: true,
      issuedAt: true,
      bookingFeeDue: true,
      campFeeDue: true,
      items: { select: { amount: true, bookingFee: true, shiftNr: true } },
    },
    orderBy: { number: "asc" },
  },
  payments: {
    select: { id: true, amount: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  },
} satisfies Prisma.PayerAccountSelect;

export const fetchAccountBilling = async (
  where: Prisma.PayerAccountWhereInput,
  now = new Date(),
) => {
  const accounts = await prisma.payerAccount.findMany({
    where,
    select: accountBillingSelect,
    orderBy: [{ contactName: "asc" }, { id: "asc" }],
  });

  return accounts.map((account) => {
    const paidCents = sum(account.payments.map((payment) => payment.amount));
    const standings = computeBillStandings(account.bills, paidCents, now);
    const bills = account.bills.map((bill, i) => ({
      ...bill,
      ...standings[i],
      sent: bill.sentAt !== null,
    }));
    return {
      ...account,
      bills,
      billedCents: sum(
        bills
          .filter((bill) => bill.status !== "void")
          .map((bill) => bill.totalCents),
      ),
      paidCents,
      paymentsUpdatedAt: account.payments[0]?.createdAt.toISOString() ?? null,
    };
  });
};

export const fetchBillSummaries = async (
  billIds: readonly number[],
  now = new Date(),
): Promise<Map<number, BillSummary>> => {
  if (billIds.length === 0) return new Map();

  const accounts = await fetchAccountBilling(
    { bills: { some: { id: { in: [...billIds] } } } },
    now,
  );

  const wanted = new Set(billIds);
  const summaries = new Map<number, BillSummary>();
  for (const { bills, paymentsUpdatedAt } of accounts) {
    for (const bill of bills.filter((bill) => wanted.has(bill.id))) {
      summaries.set(bill.id, {
        number: bill.number,
        sent: bill.sent,
        status: bill.status,
        paidCents: bill.paidCents,
        totalCents: bill.totalCents,
        paymentsUpdatedAt,
      });
    }
  }
  return summaries;
};
