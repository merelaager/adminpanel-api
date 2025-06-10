import { Static, Type } from "@sinclair/typebox";

export type SingleBillSendBody = Static<typeof SingleBillSendSchema>;

export const SingleBillSendSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

export type ShiftPdfFetchParams = Static<typeof ShiftPdfFetchSchema>;

export const ShiftPdfFetchSchema = Type.Object({
  shiftNr: Type.Number(),
});
