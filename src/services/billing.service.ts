import { Prisma } from "#app/generated/prisma/client";

import prisma from "#app/lib/prisma";
import { generateBillPdf } from "#app/services/bill-pdf.service";

export const registrationInclude = {
  child: {
    select: { name: true },
  },
};

export type CamperBillingInfo = Prisma.RegistrationGetPayload<{
  include: typeof registrationInclude;
}>;

const createBillDatabaseEntry = async (
  tx: Prisma.TransactionClient,
  contactName: string,
  billTotal: number,
) => {
  const newBill = await tx.bill.create({
    data: { contactName, billTotal },
  });
  return newBill.id;
};

// Fetch registrations by contactEmail; partition into registered/reserve; sum
// priceToPay over registered; find the first existing billId (else null).
// Returns null when no registrations exist for the email.
export const collectBillableCampers = async (
  email: string,
): Promise<{
  registered: CamperBillingInfo[];
  reserve: CamperBillingInfo[];
  registeredIds: number[];
  billTotal: number;
  billNr: number | null;
} | null> => {
  const registrations = await prisma.registration.findMany({
    where: { contactEmail: email },
    include: registrationInclude,
  });

  if (registrations.length === 0) return null;

  const registered: CamperBillingInfo[] = [];
  const reserve: CamperBillingInfo[] = [];
  const registeredIds: number[] = [];
  let billTotal = 0;
  let billNr: number | null = null;

  for (const registration of registrations) {
    if (billNr === null && registration.billId) billNr = registration.billId;
    if (registration.isRegistered) {
      registered.push(registration);
      registeredIds.push(registration.id);
      billTotal += registration.priceToPay;
    } else {
      reserve.push(registration);
    }
  }

  return { registered, reserve, registeredIds, billTotal, billNr };
};

export const createAndAssignBill = async (
  billNr: number | null,
  billTotal: number,
  registeredCampers: CamperBillingInfo[],
) => {
  const contact = {
    name: registeredCampers[0].contactName,
    email: registeredCampers[0].contactEmail,
  };

  const resolvedBillNr = await prisma.$transaction(async (tx) => {
    const targetBillNr =
      billNr ?? (await createBillDatabaseEntry(tx, contact.name, billTotal));

    // When reusing an existing bill, keep its total in sync with the current
    // camper set. The create path already sets billTotal on the new row.
    if (billNr !== null) {
      await tx.bill.update({ where: { id: billNr }, data: { billTotal } });
    }

    for (const camper of registeredCampers) {
      if (camper.billId) continue;
      await tx.registration.update({
        where: { id: camper.id },
        data: { billId: targetBillNr },
      });
    }

    return targetBillNr;
  });

  const campersBillData = registeredCampers.map((reg) => {
    return {
      name: reg.child.name,
      isOld: reg.isOld,
      shiftNr: reg.shiftNr,
      priceToPay: reg.priceToPay,
    };
  });

  await generateBillPdf(campersBillData, contact, resolvedBillNr);
  return resolvedBillNr;
};
