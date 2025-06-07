import fs from "fs";
import { Transporter } from "nodemailer";

import {
  getConfirmationReceipt,
  getRegistrationReceipt,
} from "../utils/email-builder";

import type { EmailReceiptInfo } from "../schemas/registration";
import type { CamperBillingInfo } from "../controllers/bills.controller";

class MailService {
  private transporter: Transporter;

  constructor(transporter: Transporter) {
    this.transporter = transporter;
  }

  async sendRegistrationReceipt(campers: EmailReceiptInfo[], email: string) {
    return this.transporter.sendMail({
      from: {
        name: "Merelaager",
        address: "no-reply@info.merelaager.ee",
      },
      to: email,
      subject: "Reservnimekirja kandmise teade",
      html: await getRegistrationReceipt(campers),
    });
  }

  async sendBill(
    email: string,
    billNr: number,
    regCampers: CamperBillingInfo[],
    resCampers: CamperBillingInfo[],
  ) {
    const billPath = `./data/arved/${billNr}.pdf`;

    return this.transporter.sendMail({
      from: {
        name: "Merelaager",
        address: "no-reply@info.merelaager.ee",
      },
      to: email,
      subject: "Broneeringu kinnitus",
      html: await getConfirmationReceipt(regCampers, resCampers),
      attachments: [
        {
          filename: `arve_${billNr}.pdf`,
          contentType: "application/pdf",
          content: fs.createReadStream(billPath),
        },
      ],
    });
  }
}

export default MailService;
