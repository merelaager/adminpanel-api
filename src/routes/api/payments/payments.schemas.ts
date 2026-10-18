import { Static, Type } from "@sinclair/typebox";

export const PaymentRecordSchema = Type.Object(
  {
    reference: Type.String({ minLength: 1, maxLength: 40 }),
    // Negative to undo a payment or record a refund.
    amountCents: Type.Integer({ not: { const: 0 } }),
  },
  { additionalProperties: false },
);

export type PaymentRecordBody = Static<typeof PaymentRecordSchema>;
