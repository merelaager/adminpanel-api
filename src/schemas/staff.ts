import { Static, Type } from "@sinclair/typebox";

export const CertificateSchema = Type.Object({
  name: Type.String(),
  certId: Type.String(),
  urlId: Type.Union([Type.Null(), Type.String()]),
});

export const ShiftStaffSchema = Type.Object({
  id: Type.Integer(),
  shiftNr: Type.Integer(),
  year: Type.Integer(),
  name: Type.String(),
  role: Type.String(),
  userId: Type.Union([Type.Null(), Type.Integer()]),
  certificates: Type.Array(CertificateSchema),
});

export type StaffCertificate = Static<typeof CertificateSchema>;
export type ShiftStaffMember = Static<typeof ShiftStaffSchema>;
