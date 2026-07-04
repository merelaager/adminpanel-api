import { Type } from "@sinclair/typebox";

export const SignupSchema = Type.Object({
  username: Type.String(),
  email: Type.String(),
  name: Type.String(),
  nickname: Type.Optional(Type.String()),
  password: Type.String(),
  token: Type.String(),
});

export const ResetPasswordSchema = Type.Union([
  Type.Object({
    email: Type.String(),
  }),
  Type.Object({
    token: Type.String(),
    password: Type.String(),
  }),
]);
