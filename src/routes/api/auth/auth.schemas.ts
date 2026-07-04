import { Static, Type } from "@sinclair/typebox";

export const CredentialsSchema = Type.Object({
  username: Type.String(),
  password: Type.String(),
});

export const PasswordSchema = Type.Object({
  currentPassword: Type.String(),
  password: Type.String(),
});

export const SignupSchema = Type.Object({
  username: Type.String(),
  email: Type.String(),
  name: Type.String(),
  nickname: Type.Optional(Type.String()),
  password: Type.String(),
  token: Type.String(),
});

export type SignupBody = Static<typeof SignupSchema>;
