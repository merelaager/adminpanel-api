// Side-effect module: unconditionally pins the test environment before any
// module that transitively imports `#app/*` is loaded. Assignments are
// unconditional so a developer's `.env`/shell can never point tests at a real
// database (dotenv never overrides already-set vars, in both lib/prisma.ts and
// @fastify/env). Import this FIRST in every helper.
Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "0",
  APP_URL: "http://app.test.invalid",
  COOKIE_SECRET: "test-cookie-secret-0123456789-0123456789",
  MAILGUN_API_KEY: "test-key",
  EMAIL_SERV: "mail.test.invalid",
  DATABASE_HOST: "127.0.0.1",
  DATABASE_PORT: "3307",
  DATABASE_USER: "ml_test",
  DATABASE_PASSWORD: "ml_test",
  DATABASE_NAME: "ml_test",
});
delete process.env.COOKIE_DOMAIN;
delete process.env.DATABASE_URL;
