import type { bill_status } from "#app/generated/prisma/client";
import prisma from "#app/lib/prisma";
import { startOfUTCDay } from "#app/lib/date";
import type {
  BillStatus,
  BillSummary,
} from "#app/routes/api/bills/bills.schemas";

export type BillForStatus = {
  id: number;
  number: number;
  status: bill_status;
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

export const computeBillStandings = (
  bills: readonly BillForStatus[],
  paidTotal: number,
  now: Date,
): BillStanding[] => {
  const today = startOfUTCDay(now);
  const totals = bills.map((bill) => ({
    bill,
    total: sum(bill.items.map((item) => item.amount)),
    bookingFee: sum(bill.items.map((item) => item.bookingFee)),
    paid: 0,
  }));

  const parts = totals
    .filter(({ bill }) => bill.status === "issued")
    .flatMap((totals) => [
      { totals, due: totals.bill.bookingFeeDue, amount: totals.bookingFee },
      {
        totals,
        due: totals.bill.campFeeDue,
        amount: totals.total - totals.bookingFee,
      },
    ])
    .sort(
      (a, b) =>
        a.due.getTime() - b.due.getTime() ||
        a.totals.bill.number - b.totals.bill.number,
    );

  let remaining = paidTotal;
  for (const part of parts) {
    const paid = Math.max(0, Math.min(remaining, part.amount));
    remaining -= paid;
    part.totals.paid += paid;
  }

  return totals.map(({ bill, total, bookingFee, paid }) => {
    let status: BillStatus = "open";
    if (bill.status === "void") status = "void";
    else if (paid >= total) status = "paid";
    else if (bill.campFeeDue < today) status = "camp-fee-overdue";
    else if (bill.bookingFeeDue < today && paid < bookingFee) {
      status = "booking-fee-overdue";
    }
    return { status, paidCents: paid, totalCents: total };
  });
};

export const fetchBillSummaries = async (
  billIds: readonly number[],
  now = new Date(),
): Promise<Map<number, BillSummary>> => {
  if (billIds.length === 0) return new Map();

  const requested = await prisma.bill.findMany({
    where: { id: { in: [...billIds] } },
    select: { accountId: true },
  });
  const accountIds = [...new Set(requested.map((bill) => bill.accountId))];

  const [bills, payments] = await Promise.all([
    prisma.bill.findMany({
      where: { accountId: { in: accountIds } },
      select: {
        id: true,
        number: true,
        status: true,
        sentAt: true,
        accountId: true,
        bookingFeeDue: true,
        campFeeDue: true,
        items: { select: { amount: true, bookingFee: true } },
      },
    }),
    prisma.payment.groupBy({
      by: ["accountId"],
      where: { accountId: { in: accountIds } },
      _sum: { amount: true },
      _max: { createdAt: true },
    }),
  ]);

  const paymentsByAccount = new Map(
    payments.map((payment) => [payment.accountId, payment]),
  );

  const wanted = new Set(billIds);
  const summaries = new Map<number, BillSummary>();
  for (const accountId of accountIds) {
    const accountBills = bills.filter((bill) => bill.accountId === accountId);
    const accountPayments = paymentsByAccount.get(accountId);
    const standings = computeBillStandings(
      accountBills,
      accountPayments?._sum.amount ?? 0,
      now,
    );
    const paymentsUpdatedAt =
      accountPayments?._max.createdAt?.toISOString() ?? null;
    accountBills.forEach((bill, i) => {
      if (!wanted.has(bill.id)) return;
      summaries.set(bill.id, {
        number: bill.number,
        sent: bill.sentAt !== null,
        ...standings[i],
        paymentsUpdatedAt,
      });
    });
  }
  return summaries;
};
