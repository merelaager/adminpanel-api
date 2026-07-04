import { JSONSchemaType } from "env-schema";

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  APP_URL: string;
  COOKIE_SECRET: string;
  COOKIE_DOMAIN?: string;
  MAILGUN_API_KEY: string;
  EMAIL_SERV: string;
  DATABASE_HOST: string;
  DATABASE_USER: string;
  DATABASE_PASSWORD: string;
  DATABASE_NAME: string;
}

export const envSchema: JSONSchemaType<EnvConfig> = {
  type: "object",
  required: [
    "COOKIE_SECRET",
    "MAILGUN_API_KEY",
    "EMAIL_SERV",
    "DATABASE_HOST",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_NAME",
  ],
  properties: {
    NODE_ENV: { type: "string", default: "development" },
    PORT: { type: "number", default: 4000 },
    APP_URL: { type: "string", default: "https://sild.merelaager.ee" },
    COOKIE_SECRET: { type: "string" },
    COOKIE_DOMAIN: { type: "string", nullable: true },
    MAILGUN_API_KEY: { type: "string" },
    EMAIL_SERV: { type: "string" },
    DATABASE_HOST: { type: "string" },
    DATABASE_USER: { type: "string" },
    DATABASE_PASSWORD: { type: "string" },
    DATABASE_NAME: { type: "string" },
  },
};

declare module "fastify" {
  interface FastifyInstance {
    config: EnvConfig;
  }
}

export const requiresSecureCookies = (nodeEnv: string): boolean =>
  nodeEnv !== "development";
