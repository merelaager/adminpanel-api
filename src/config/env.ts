import { JSONSchemaType } from "env-schema";

export const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export interface EnvConfig {
  NODE_ENV: NodeEnv;
  PORT: number;
  APP_URL: string;
  COOKIE_SECRET: string;
  COOKIE_DOMAIN?: string;
  MAILGUN_API_KEY: string;
  REGISTRATION_API_KEY: string;
  EMAIL_SERV: string;
  DATABASE_HOST: string;
  DATABASE_PORT: number;
  DATABASE_USER: string;
  DATABASE_PASSWORD: string;
  DATABASE_NAME: string;
}

export const envSchema: JSONSchemaType<EnvConfig> = {
  type: "object",
  required: [
    "NODE_ENV",
    "COOKIE_SECRET",
    "MAILGUN_API_KEY",
    "REGISTRATION_API_KEY",
    "EMAIL_SERV",
    "DATABASE_HOST",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_NAME",
  ],
  properties: {
    NODE_ENV: { type: "string", enum: NODE_ENVS },
    PORT: { type: "number", default: 4000 },
    APP_URL: { type: "string", default: "https://sild.merelaager.ee" },
    COOKIE_SECRET: { type: "string" },
    COOKIE_DOMAIN: { type: "string", nullable: true },
    MAILGUN_API_KEY: { type: "string" },
    REGISTRATION_API_KEY: { type: "string", minLength: 32 },
    EMAIL_SERV: { type: "string" },
    DATABASE_HOST: { type: "string" },
    DATABASE_PORT: { type: "number", default: 3306 },
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
