import "dotenv/config";

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
  const apiKey = process.env.MAILGUN_API_KEY;

  if (!apiKey) {
    throw new Error("Could not find Mailgun API key");
  }

  const config = {
    auth: {
      api_key: apiKey,
      domain: process.env.EMAIL_SERV,
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
