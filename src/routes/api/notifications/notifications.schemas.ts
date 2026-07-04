import { Type } from "@sinclair/typebox";

export const SingleBillSendSchema = Type.Object({
  email: Type.String({ format: "email" }),
});
