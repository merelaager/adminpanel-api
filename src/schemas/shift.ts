import { Static, Type } from "@sinclair/typebox";

export type SingleBillSendBody = Static<typeof SingleBillSendSchema>;

export const SingleBillSendSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

export type ShiftResourceFetchParams = Static<typeof ShiftResourceFetchParams>;

export const ShiftResourceFetchParams = Type.Object({
  shiftNr: Type.Number(),
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
  userId: Type.Number(),
  name: Type.String(),
  shiftNr: Type.Number(),
  role: Type.String(),
  roleId: Type.Number(),
});

export const ShiftTentQuerySchema = Type.Object({
  shiftNr: Type.Number(),
  tentNr: Type.Number(),
});

export type TentQueryParams = Static<typeof ShiftTentQuerySchema>;

export const AddGradeSchema = Type.Object({
  score: Type.Number(),
});

export type AddScoreBody = Static<typeof AddGradeSchema>;
