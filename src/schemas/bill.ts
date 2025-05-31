import { Static, Type } from "@sinclair/typebox";

export type BillCreationBody = Static<typeof BillCreationSchema>;

export const BillCreationSchema = Type.Object({
  email: Type.String({ format: "email" }),
});
