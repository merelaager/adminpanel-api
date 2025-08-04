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

export type CamperRecord = Static<typeof CamperRecordSchema>;

export const CamperRecordSchema = Type.Object({
  id: Type.Number(),
  childId: Type.Number(),
  childName: Type.String(),
  childSex: Type.Union([Type.Literal("M"), Type.Literal("F")]),
  shiftNr: Type.Integer(),
  year: Type.Integer(),
  tentNr: Type.Union([Type.Integer(), Type.Null()]),
  teamId: Type.Union([Type.Integer(), Type.Null()]),
  isPresent: Type.Boolean(),
  ageAtCamp: Type.Integer(),
});

export type UserParams = Static<typeof UserParamsSchema>;

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

export type PatchUserBody = Static<typeof PatchUserSchema>;

export const CreateInviteSchema = Type.Object({
  email: Type.String({ format: "email" }),
  name: Type.String(),
  shiftNr: Type.Integer(),
  role: Type.String(),
});

export type CreateInviteBody = Static<typeof CreateInviteSchema>;

export const SignupSchema = Type.Object({
  username: Type.String(),
  email: Type.String(),
  name: Type.String(),
  nickname: Type.Optional(Type.String()),
  password: Type.String(),
  token: Type.String(),
});

export type SignupBody = Static<typeof SignupSchema>;

export const ResetPasswordSchema = Type.Union([
  Type.Object({
    email: Type.String(),
  }),
  Type.Object({
    token: Type.String(),
    password: Type.String(),
  }),
]);

export type RequestPasswordResetBody = Static<typeof ResetPasswordSchema>;
