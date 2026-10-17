import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import nodemailer, { Transporter } from "nodemailer";

import { createMailgunTransport } from "#app/lib/mailgun-transport";

declare module "fastify" {
  interface FastifyInstance {
    mailer: Transporter;
  }
}

const mailerPlugin: FastifyPluginAsync = fp(async (server) => {
  const transporter: Transporter =
    server.config.NODE_ENV === "test"
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport(
          createMailgunTransport({
            apiKey: server.config.MAILGUN_API_KEY,
            domain: server.config.EMAIL_SERV,
            host: "api.eu.mailgun.net",
          }),
        );
  server.decorate("mailer", transporter);

  if (server.config.NODE_ENV !== "test") {
    try {
      await transporter.verify();
      server.log.info("Nodemailer transporter is ready");
    } catch (err) {
      server.log.error(err, "Failed to configure Nodemailer transporter");
      throw err;
    }
  }
});

export default mailerPlugin;
