import { Type } from "@sinclair/typebox";

export const CredentialsSchema = Type.Object({
  username: Type.String(),
  password: Type.String(),
});

export interface Auth {
  userId: number;
}

export const PasswordSchema = Type.Object({
  currentPassword: Type.String(),
  password: Type.String(),
});
