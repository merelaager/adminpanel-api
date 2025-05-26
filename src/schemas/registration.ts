import { Static, Type } from "@sinclair/typebox";

export const FilteredRegistrationSchema = Type.Object({
  id: Type.Integer(),
  childId: Type.Integer(),
  shiftNr: Type.Integer(),
  isRegistered: Type.Boolean(),
  regOrder: Type.Integer(),
  isOld: Type.Boolean(),
  tsSize: Type.String(),
  birthday: Type.Optional(Type.String()), // TODO: fix this as it is actually a Date
  road: Type.Optional(Type.String()),
  county: Type.Optional(Type.String()),
  country: Type.Optional(Type.String()),
  pricePaid: Type.Optional(Type.Integer()),
  priceToPay: Type.Optional(Type.Integer()),
  notifSent: Type.Optional(Type.Boolean()),
  billId: Type.Optional(Type.Integer()),
  contactName: Type.Optional(Type.String()),
  contactNUmber: Type.Optional(Type.String()),
  contactEmail: Type.Optional(Type.String()),
  backupTel: Type.Optional(Type.String()),
});

export type PatchRegistrationBody = Static<typeof PatchRegistrationSchema>;

export const PatchRegistrationSchema = Type.Object(
  {
    isRegistered: Type.Optional(Type.Boolean()),
    isOld: Type.Optional(Type.Boolean()),
    pricePaid: Type.Optional(Type.Number()),
    priceToPay: Type.Optional(Type.Number()),
    kekKok: Type.Optional(Type.Boolean()),
  },
  {
    additionalProperties: false,
  },
);
