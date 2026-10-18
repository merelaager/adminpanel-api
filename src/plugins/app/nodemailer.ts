import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { Transporter } from "nodemailer";

import { createMailer, sendsRealMail } from "#app/lib/mailer";

declare module "fastify" {
  interface FastifyInstance {
    mailer: Transporter;
  }
}

const mailerPlugin: FastifyPluginAsync = fp(async (server) => {
  const transporter = createMailer(server.config, server.log);
  server.decorate("mailer", transporter);

  if (sendsRealMail(server.config)) {
    try {
      await transporter.verify();
      server.log.info("Nodemailer transporter is ready");
    } catch (err) {
      server.log.error(err, "Failed to configure Nodemailer transporter");
      throw err;
    }
  }
  if (server.config.MAIL_REDIRECT_TO) {
    server.log.warn(
      `All email is redirected to ${server.config.MAIL_REDIRECT_TO}`,
    );
  } else if (server.config.NODE_ENV === "development") {
    server.log.warn("Email is only logged: set MAIL_REDIRECT_TO to receive it");
  }
});

export default mailerPlugin;
