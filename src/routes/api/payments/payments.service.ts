import prisma from "#app/lib/prisma";
import { getCurrentCampYear } from "#app/lib/camp-year";
import { fetchAccountBilling } from "#app/services/bill-status.service";

import type { PayerAccountData, PaymentRecordBody } from "./payments.schemas";

// Adds a sum to the account the reference number belongs to.
export const recordPayment = async (
  userId: number,
  body: PaymentRecordBody,
): Promise<number | null> => {
  const reference = body.reference.replace(/\s/g, "");
  const account = await prisma.payerAccount.findUnique({
    where: { reference },
    select: { id: true },
  });
  if (!account) return null;

  const payment = await prisma.payment.create({
    data: {
      accountId: account.id,
      amount: body.amountCents,
      method: "transfer",
      recordedById: userId,
    },
  });
  return payment.id;
};

export const fetchPayerAccounts = async (): Promise<PayerAccountData[]> => {
  const accounts = await fetchAccountBilling({ season: getCurrentCampYear() });

  return accounts.map((account) => ({
    reference: account.reference,
    name: account.contactName,
    email: account.email,
    billedCents: account.billedCents,
    paidCents: account.paidCents,
    paymentsUpdatedAt: account.paymentsUpdatedAt,
    bills: account.bills.map((bill) => ({
      number: bill.number,
      status: bill.status,
      sent: bill.sent,
      paidCents: bill.paidCents,
      totalCents: bill.totalCents,
      issuedAt: bill.issuedAt.toISOString(),
      shiftNrs: [...new Set(bill.items.map((item) => item.shiftNr))].sort(
        (a, b) => a - b,
      ),
    })),
    payments: account.payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amount,
      createdAt: payment.createdAt.toISOString(),
    })),
  }));
};
