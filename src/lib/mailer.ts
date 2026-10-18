import type { FastifyBaseLogger } from "fastify";
import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

import type { EnvConfig } from "#app/config/env";
import { createMailgunTransport } from "#app/lib/mailgun-transport";

type Recipients = Mail.Options["to"];

const formatRecipients = (recipients: Recipients): string => {
  if (!recipients) return "";
  if (typeof recipients === "string") return recipients;
  if (Array.isArray(recipients)) {
    return recipients.map(formatRecipients).join(", ");
  }
  return recipients.address ?? "";
};

const describeRecipients = ({ to, cc, bcc }: Mail.Options): string =>
  [
    `to: ${formatRecipients(to)}`,
    cc && `cc: ${formatRecipients(cc)}`,
    bcc && `bcc: ${formatRecipients(bcc)}`,
  ]
    .filter(Boolean)
    .join(", ");

// Sends every message to `address` instead of its recipients.
export const redirectAllMail = (
  transporter: Transporter,
  address: string,
): void => {
  transporter.use("compile", (mail, done) => {
    mail.data.subject = `[${describeRecipients(mail.data)}] ${mail.data.subject ?? ""}`;
    mail.data.to = address;
    delete mail.data.cc;
    delete mail.data.bcc;
    done();
  });
};

export type MailerConfig = Pick<
  EnvConfig,
  "NODE_ENV" | "MAILGUN_API_KEY" | "EMAIL_SERV" | "MAIL_REDIRECT_TO"
>;

// Whether the mailer sends through Mailgun.
export const sendsRealMail = (config: MailerConfig): boolean =>
  config.NODE_ENV === "production" ||
  (config.NODE_ENV === "development" && Boolean(config.MAIL_REDIRECT_TO));

// Development sends only when MAIL_REDIRECT_TO is set. Logs otherwise.
export const createMailer = (
  config: MailerConfig,
  log: FastifyBaseLogger,
): Transporter => {
  if (!sendsRealMail(config)) {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    if (config.NODE_ENV === "development") {
      transporter.use("compile", (mail, done) => {
        log.info(
          `Email not sent (MAIL_REDIRECT_TO is not set): ${describeRecipients(mail.data)}; subject: ${mail.data.subject ?? ""}`,
        );
        done();
      });
    }
    return transporter;
  }

  const transporter = nodemailer.createTransport(
    createMailgunTransport({
      apiKey: config.MAILGUN_API_KEY,
      domain: config.EMAIL_SERV,
      host: "api.eu.mailgun.net",
    }),
  );
  if (config.MAIL_REDIRECT_TO) {
    redirectAllMail(transporter, config.MAIL_REDIRECT_TO);
  }
  return transporter;
};
