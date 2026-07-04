import type { Transporter } from "nodemailer";

import prisma from "#app/lib/prisma";
import MailService from "#app/services/mail.service";
import type { CamperBillingInfo } from "#app/services/billing.service";

// Sends the bill email and marks the registered campers as notified.
export const sendBillNotification = async (
  mailer: Transporter,
  appUrl: string,
  email: string,
  billNr: number,
  registered: CamperBillingInfo[],
  reserve: CamperBillingInfo[],
  registeredIds: number[],
): Promise<void> => {
  const mailService = new MailService(mailer, appUrl);

  await mailService.sendBill(email, billNr, registered, reserve);

  await prisma.registration.updateMany({
    where: {
      id: { in: registeredIds },
    },
    data: {
      notifSent: true,
    },
  });
};
