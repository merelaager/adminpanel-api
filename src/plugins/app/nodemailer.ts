import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import nodemailer, { Transporter } from "nodemailer";
import mg from "nodemailer-mailgun-transport";

declare module "fastify" {
  interface FastifyInstance {
    mailer: Transporter;
  }
}

const mailerPlugin: FastifyPluginAsync = fp(async (server) => {
  const config = {
    auth: {
      api_key: server.config.MAILGUN_API_KEY,
      domain: server.config.EMAIL_SERV,
    },
    host: "api.eu.mailgun.net",
  };

  const transporter = nodemailer.createTransport(mg(config));
  server.decorate("mailer", transporter);

  try {
    await transporter.verify();
    server.log.info("Nodemailer transporter is ready");
  } catch (err) {
    server.log.error(err, "Failed to configure Nodemailer transporter");
    throw err;
  }
});

export default mailerPlugin;
