import { Static, Type } from "@sinclair/typebox";

import { BillStatusSchema } from "#app/routes/api/bills/bills.schemas";

export const PaymentRecordSchema = Type.Object(
  {
    reference: Type.String({ minLength: 1, maxLength: 40 }),
    // Negative to undo a payment or record a refund.
    amountCents: Type.Integer({ not: { const: 0 } }),
  },
  { additionalProperties: false },
);

export type PaymentRecordBody = Static<typeof PaymentRecordSchema>;

export const AccountBillSchema = Type.Object({
  number: Type.Integer(),
  status: BillStatusSchema,
  sent: Type.Boolean(),
  paidCents: Type.Integer(),
  totalCents: Type.Integer(),
  issuedAt: Type.String({ format: "date-time" }),
  shiftNrs: Type.Array(Type.Integer()),
});

export const AccountPaymentSchema = Type.Object({
  id: Type.Integer(),
  amountCents: Type.Integer(),
  createdAt: Type.String({ format: "date-time" }),
});

export const PayerAccountSchema = Type.Object({
  reference: Type.String(),
  name: Type.String(),
  email: Type.String(),
  billedCents: Type.Integer(),
  paidCents: Type.Integer(),
  paymentsUpdatedAt: Type.Union([
    Type.Null(),
    Type.String({ format: "date-time" }),
  ]),
  bills: Type.Array(AccountBillSchema),
  payments: Type.Array(AccountPaymentSchema),
});

export type PayerAccountData = Static<typeof PayerAccountSchema>;
