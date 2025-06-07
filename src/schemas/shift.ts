import { Static, Type } from "@sinclair/typebox";

export type SingleBillSendBody = Static<typeof SingleBillSendSchema>;

export const SingleBillSendSchema = Type.Object({
  email: Type.String({ format: "email" }),
});
