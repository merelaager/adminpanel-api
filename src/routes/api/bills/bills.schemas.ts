import { Type, type Static } from "@sinclair/typebox";

export const ParentEmailSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

export const BillingFailureSchema = Type.Union([
  Type.Object({ email: Type.String() }),
  Type.Object({ registrations: Type.String() }),
]);

export const BillParamsSchema = Type.Object({
  billNr: Type.Integer(),
});

export const BillStatusSchema = Type.Union([
  Type.Literal("paid"),
  Type.Literal("open"),
  Type.Literal("booking-fee-overdue"),
  Type.Literal("camp-fee-overdue"),
  Type.Literal("void"),
]);

export const BillSummarySchema = Type.Object({
  number: Type.Integer(),
  sent: Type.Boolean(),
  status: BillStatusSchema,
  paidCents: Type.Integer(),
  totalCents: Type.Integer(),
  // When a payment was last added to the parent's account.
  paymentsUpdatedAt: Type.Union([
    Type.Null(),
    Type.String({ format: "date-time" }),
  ]),
});

export type BillStatus = Static<typeof BillStatusSchema>;
export type BillSummary = Static<typeof BillSummarySchema>;
