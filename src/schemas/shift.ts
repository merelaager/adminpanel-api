import { Static, Type } from "@sinclair/typebox";

export type SingleBillSendBody = Static<typeof SingleBillSendSchema>;

export const SingleBillSendSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

export type ShiftResourceFetchParams = Static<typeof ShiftResourceFetchParams>;

export const ShiftResourceFetchParams = Type.Object({
  shiftNr: Type.Integer(),
});

export const RoleNameMap: { [key: string]: string } = {
  root: "Juurkasutaja",
  boss: "Juhataja",
  instructor: "Kasvataja",
  helper: "Abikasvataja",
  "reg-viewer-basic": "Sirvija",
};

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

export type TentQueryParams = Static<typeof ShiftTentQuerySchema>;

export const AddGradeSchema = Type.Object({
  score: Type.Integer(),
});

export type AddScoreBody = Static<typeof AddGradeSchema>;
