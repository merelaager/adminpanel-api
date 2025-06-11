import { Static, Type } from "@sinclair/typebox";

export const UserCreateSchema = Type.Object({
  username: Type.String(),
  name: Type.String(),
  email: Type.String({ format: "email" }),
  nickname: Type.Optional(Type.String()),
  role: Type.Optional(Type.String()),
  password: Type.String(),
  initialShift: Type.Optional(Type.Integer()),
});

export type UserInfo = Static<typeof UserInfoSchema>;

export const UserInfoSchema = Type.Object({
  userId: Type.Number(),
  name: Type.String(),
  nickname: Type.Union([Type.String(), Type.Null()]),
  email: Type.Union([Type.String(), Type.Null()]),
  currentShift: Type.Number(),
  isRoot: Type.Boolean(),
});
