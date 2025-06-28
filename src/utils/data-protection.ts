import { createHmac } from "node:crypto";
import "dotenv/config";

export const computeIdCodeHash = (idCode: string) => {
  const hashSecret = process.env.IDCODE_HASH_SECRET;
  if (!hashSecret || hashSecret.length < 16) {
    throw new Error("Invalid HMAC secret");
  }

  return createHmac("sha256", hashSecret).update(idCode).digest("hex");
};
