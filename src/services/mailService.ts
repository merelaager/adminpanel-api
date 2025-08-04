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

  async sendPasswordResetToken(email: string, token: string) {
    const link = `https://sild.merelaager.ee/password-reset?token=${token}`;
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
    const link = `https://sild.merelaager.ee/signup?token=${token}&email=${safeEmail}&name=${safeName}`;
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
