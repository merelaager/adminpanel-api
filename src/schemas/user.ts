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
  userId: Type.Integer(),
  name: Type.String(),
  nickname: Type.Union([Type.String(), Type.Null()]),
  email: Type.Union([Type.String(), Type.Null()]),
  currentShift: Type.Integer(),
  currentRole: Type.String(),
  isRoot: Type.Boolean(),
  managedShifts: Type.Array(Type.Integer()),
});

export const UserParamsSchema = Type.Object({
  userId: Type.Integer(),
});

export const PatchUserSchema = Type.Partial(
  Type.Object(
    {
      currentShift: Type.Integer(),
    },
    {
      additionalProperties: false,
    },
  ),
);

export const CreateInviteSchema = Type.Object({
  email: Type.String({ format: "email" }),
  name: Type.String(),
  shiftNr: Type.Integer(),
  role: Type.String(),
});

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
