import { Static, Type } from "@sinclair/typebox";

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

export type PatchUserBody = Static<typeof PatchUserSchema>;

export const CreateInviteSchema = Type.Object({
  email: Type.String({ format: "email" }),
  name: Type.String(),
  shiftNr: Type.Integer(),
  role: Type.String(),
});

export type CreateInviteBody = Static<typeof CreateInviteSchema>;
