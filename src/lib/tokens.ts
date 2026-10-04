import { createHash, randomUUID } from "node:crypto";

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const createToken = (): { token: string; tokenHash: string } => {
  const token = randomUUID();
  return { token, tokenHash: hashToken(token) };
};
