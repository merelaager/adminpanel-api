import { Static, Type } from "@sinclair/typebox";

export const ChildBillSchema = Type.Object({
  childName: Type.String(),
  pricePaid: Type.Integer(),
  priceToPay: Type.Integer(),
  shiftNr: Type.Integer(),
  billSent: Type.Boolean(),
});

export const ParentBillSchema = Type.Object({
  name: Type.String(),
  email: Type.String(),
  billNr: Type.Union([Type.Null(), Type.Integer()]),
  records: Type.Array(ChildBillSchema),
});

export type ParentBillData = Static<typeof ParentBillSchema>;
