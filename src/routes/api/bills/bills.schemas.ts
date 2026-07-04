import { Type } from "@sinclair/typebox";

export const BillCreationSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

export const BillParamsSchema = Type.Object({
  billId: Type.Integer(),
});
