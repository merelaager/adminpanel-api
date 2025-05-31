import { Transporter } from "nodemailer";

import { getRegistrationReceipt } from "../utils/email-builder";

import { EmailReceiptInfo } from "../schemas/registration";

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
}

export default MailService;
