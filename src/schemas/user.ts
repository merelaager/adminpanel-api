import { Type } from "@sinclair/typebox";

export const UserCreateSchema = Type.Object({
  username: Type.String(),
  name: Type.String(),
  email: Type.String({ format: "email" }),
  nickname: Type.Optional(Type.String()),
  role: Type.Optional(Type.String()),
  password: Type.String(),
});
