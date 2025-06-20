import {Static, Type} from "@sinclair/typebox";

export type ShiftStaffMember = Static<typeof ShiftStaffSchema>

export const ShiftStaffSchema = Type.Object({
  id: Type.Integer(),
  shiftNr: Type.Integer(),
  year: Type.Integer(),
  name: Type.String(),
  role: Type.String(),
  userId: Type.Union([Type.Null(), Type.Integer()]),
});
