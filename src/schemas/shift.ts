import { Static, Type } from "@sinclair/typebox";

export const SingleBillSendSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

export const ShiftResourceFetchParams = Type.Object({
  shiftNr: Type.Integer(),
});

export type UserWithShiftRole = Static<typeof UserWithShiftRoleSchema>;

export const UserWithShiftRoleSchema = Type.Object({
  userId: Type.Integer(),
  name: Type.String(),
  shiftNr: Type.Integer(),
  role: Type.String(),
  roleId: Type.Integer(),
});

export const ShiftTentQuerySchema = Type.Object({
  shiftNr: Type.Integer(),
  tentNr: Type.Integer(),
});

export const AddGradeSchema = Type.Object({
  score: Type.Integer(),
});
