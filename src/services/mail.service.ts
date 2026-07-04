import fs from "fs";
import { Transporter } from "nodemailer";

import {
  getConfirmationReceipt,
  getRegistrationReceipt,
} from "#app/services/email-templates";

import type { EmailReceiptInfo } from "#app/routes/api/registrations/registrations.schemas";
import type { CamperBillingInfo } from "#app/services/billing.service";

class MailService {
  private transporter: Transporter;
  private appUrl: string;

  constructor(transporter: Transporter, appUrl: string) {
    this.transporter = transporter;
    this.appUrl = appUrl;
  }

  async sendRegistrationReceipt(campers: EmailReceiptInfo[], email: string) {
    const registrationReceipt = await getRegistrationReceipt(campers);

    return this.transporter.sendMail({
      from: {
        name: "Merelaager",
        address: "no-reply@info.merelaager.ee",
      },
      to: email,
      cc: registrationReceipt.staffEmails,
      subject: "Reservnimekirja kandmise teade",
      html: registrationReceipt.html,
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

  async sendPasswordResetToken(email: string, token: string) {
    const link = `${this.appUrl}/password-reset?token=${token}`;
    return this.transporter.sendMail({
      from: {
        name: "Merelaager — süsteem",
        address: "no-reply@info.merelaager.ee",
      },
      to: email,
      subject: "e-Kambüüsi salasõna lähtestamine",
      text:
        `Sisesta uus salasõna aadressil ${link}\n` + "Link toimib 24 tundi.",
      html: `<p>Salasõna lähtestamise link: <a href="${link}">${link}</a><br />Link toimib 24 tundi.</p>`,
    });
  }

  async sendSignupToken(email: string, token: string, name: string) {
    const safeEmail = encodeURIComponent(email);
    const safeName = encodeURIComponent(name);
    const link = `${this.appUrl}/signup?token=${token}&email=${safeEmail}&name=${safeName}`;
    return this.transporter.sendMail({
      from: {
        name: "Merelaager — süsteem",
        address: "no-reply@info.merelaager.ee",
      },
      to: email,
      subject: "e-Kambüüsi konto loomine",
      text: `Loo uus konto aadressil ${link}\n` + "Link toimib 24 tundi.",
      html: `<p>Konto loomise link: <a href="${link}">${link}</a><br />Link toimib 24 tundi.</p>`,
    });
  }
}

export default MailService;
