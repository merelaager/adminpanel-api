import argon2 from "argon2";
import bcrypt from "bcrypt";

export const MAX_PASSWORD_LENGTH = 128;

export const validatePasswordPolicy = (password: string): string | null => {
  if (password.length < 8) return "Salasõna on liiga lühike.";
  if (password.length > MAX_PASSWORD_LENGTH) return "Salasõna on liiga pikk.";
  return null;
};

export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, { type: argon2.argon2id });

const isBcryptHash = (hash: string): boolean => /^\$2[aby]\$/.test(hash);

export type PasswordCheck = { valid: boolean; needsRehash: boolean };

export const verifyPassword = async (
  hash: string,
  password: string,
): Promise<PasswordCheck> => {
  if (isBcryptHash(hash)) {
    return { valid: await bcrypt.compare(password, hash), needsRehash: true };
  }

  return {
    valid: await argon2.verify(hash, password),
    needsRehash: argon2.needsRehash(hash),
  };
};
