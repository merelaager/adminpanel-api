import { Transporter } from "nodemailer";

import {
  getBillEmail,
  getRegistrationReceipt,
  type ChildInShift,
  type ChildOnOtherBill,
} from "#app/services/email-templates";
import type { BillDocument } from "#app/services/bill-pdf.service";

import type { EmailReceiptInfo } from "#app/routes/api/registrations/registrations.schemas";

class MailService {
  private transporter: Transporter;
  private appUrl: string;

  constructor(transporter: Transporter, appUrl: string) {
    this.transporter = transporter;
    this.appUrl = appUrl;
  }

  async sendRegistrationReceipt(
    campers: EmailReceiptInfo[],
    email: string,
  ): Promise<void> {
    const registrationReceipt = await getRegistrationReceipt(campers);

    await this.transporter.sendMail({
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
    bill: BillDocument,
    pdf: Buffer,
    onOtherBills: ChildOnOtherBill[],
    reserve: ChildInShift[],
  ): Promise<void> {
    await this.transporter.sendMail({
      from: {
        name: "Merelaager",
        address: "no-reply@info.merelaager.ee",
      },
      to: bill.payerEmail,
      subject: "Broneeringu kinnitus",
      html: await getBillEmail(bill, onOtherBills, reserve),
      attachments: [
        {
          filename: `arve_${bill.number}.pdf`,
          contentType: "application/pdf",
          content: pdf,
        },
      ],
    });
  }

  async sendPasswordResetToken(email: string, token: string): Promise<void> {
    const link = `${this.appUrl}/password-reset?token=${token}`;
    await this.transporter.sendMail({
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

  async sendSignupToken(
    email: string,
    token: string,
    name: string,
  ): Promise<void> {
    const safeEmail = encodeURIComponent(email);
    const safeName = encodeURIComponent(name);
    const link = `${this.appUrl}/signup?token=${token}&email=${safeEmail}&name=${safeName}`;
    await this.transporter.sendMail({
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
