import prisma from "#app/lib/prisma";
import { startOfUTCDay } from "#app/lib/date";

import type { PaymentRecordBody } from "./payments.schemas";

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
      paidOn: startOfUTCDay(new Date()),
      method: "transfer",
      reference,
      recordedById: userId,
    },
  });
  return payment.id;
};
