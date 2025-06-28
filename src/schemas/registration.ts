import { Static, Type } from "@sinclair/typebox";

const STRING_MAX = 255;

export type CreateRegistrationData = Static<typeof RegistrationCreationSchema>;
export type CreateRegistrationsBody = Static<
  typeof RegistrationsCreationSchema
>;

export const RegistrationCreationSchema = Type.Object({
  name: Type.String(),
  idCode: Type.Optional(Type.String({ minLength: 11, maxLength: 11 })),
  sex: Type.Optional(Type.Union([Type.Literal("M"), Type.Literal("F")])),
  dob: Type.Optional(Type.String({ format: "date-time" })), // TypeBox uses ISO strings for date
  addendum: Type.Optional(Type.String({ maxLength: STRING_MAX })),
  shiftNr: Type.Number({ minimum: 1, maximum: 4 }), // TODO: make the shift max dynamic
  isNew: Type.Boolean(),
  shirtSize: Type.String({ maxLength: 10 }),
  road: Type.String({ maxLength: STRING_MAX }),
  city: Type.String({ maxLength: STRING_MAX }),
  county: Type.String({ maxLength: STRING_MAX }),
  country: Type.String({ maxLength: STRING_MAX }),
  contactName: Type.String({ maxLength: STRING_MAX }),
  contactEmail: Type.String({ maxLength: STRING_MAX, format: "email" }),
  contactNumber: Type.String({ maxLength: 25 }),
  backupTel: Type.Optional(Type.String({ maxLength: 25 })),
  sendEmail: Type.Optional(Type.Boolean()),
});

export const RegistrationsCreationSchema = Type.Array(
  RegistrationCreationSchema,
);

export type FetchRegistrationsQueryString = Static<
  typeof RegistrationsFetchSchema
>;

export const RegistrationsFetchSchema = Type.Object({
  shiftNr: Type.Integer(),
});

export type FilteredRegistrationSchema = Static<
  typeof FilteredRegistrationSchema
>;

export const FilteredRegistrationSchema = Type.Object({
  id: Type.Integer(),
  childId: Type.Integer(),
  child: Type.Object({
    name: Type.String(),
    sex: Type.Union([Type.Literal("M"), Type.Literal("F")]),
    currentAge: Type.Number(),
  }),
  shiftNr: Type.Integer(),
  isRegistered: Type.Boolean(),
  regOrder: Type.Integer(),
  isOld: Type.Boolean(),
  tsSize: Type.String(),
  birthday: Type.Optional(Type.String()), // TODO: fix this as it is actually a Date
  road: Type.Optional(Type.String()),
  county: Type.Optional(Type.String()),
  country: Type.Optional(Type.String()),
  addendum: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  pricePaid: Type.Optional(Type.Integer()),
  priceToPay: Type.Optional(Type.Integer()),
  notifSent: Type.Optional(Type.Boolean()),
  billId: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  contactName: Type.Optional(Type.String()),
  contactNumber: Type.Optional(Type.String()),
  contactEmail: Type.Optional(Type.String()),
  backupTel: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export type PatchRegistrationBody = Static<typeof PatchRegistrationSchema>;

export const PatchRegistrationSchema = Type.Object(
  {
    isRegistered: Type.Optional(Type.Boolean()),
    isOld: Type.Optional(Type.Boolean()),
    pricePaid: Type.Optional(Type.Number()),
    priceToPay: Type.Optional(Type.Number()),
  },
  {
    additionalProperties: false,
  },
);

export type EmailReceiptInfo = {
  name: string;
  shiftNr: number;
  contactEmail: string;
};
