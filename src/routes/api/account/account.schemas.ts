import { Type } from "@sinclair/typebox";

// Split of the former ResetPasswordSchema union (§5, §8.7).
export const PasswordResetRequestSchema = Type.Object({
  email: Type.String(),
});

export const PasswordResetConfirmSchema = Type.Object({
  token: Type.String(),
  password: Type.String(),
});
