import { Static, Type } from "@sinclair/typebox";

// --- Params & body schemas (from schemas/shift.ts) ---

export const ShiftResourceFetchParams = Type.Object({
  shiftNr: Type.Integer(),
});

export const ShiftTentQuerySchema = Type.Object({
  shiftNr: Type.Integer(),
  tentNr: Type.Integer(),
});

export const AddGradeSchema = Type.Object({
  score: Type.Integer({ minimum: 0, maximum: 255 }),
});

export type UserWithShiftRole = Static<typeof UserWithShiftRoleSchema>;

export const UserWithShiftRoleSchema = Type.Object({
  userId: Type.Integer(),
  name: Type.String(),
  shiftNr: Type.Integer(),
  role: Type.String(),
  roleId: Type.Integer(),
});

// --- Camper record schema (from schemas/user.ts) ---

export type CamperRecord = Static<typeof CamperRecordSchema>;

export const CamperRecordSchema = Type.Object({
  id: Type.Integer(),
  childId: Type.Integer(),
  childName: Type.String(),
  childSex: Type.Union([Type.Literal("M"), Type.Literal("F")]),
  shiftNr: Type.Integer(),
  year: Type.Integer(),
  tentNr: Type.Union([Type.Integer(), Type.Null()]),
  teamId: Type.Union([Type.Integer(), Type.Null()]),
  isPresent: Type.Boolean(),
  ageAtCamp: Type.Integer(),
});

// --- Tent schemas (from schemas/tent.ts) ---

export const TentScoreSchema = Type.Object({
  scoreId: Type.Integer(),
  score: Type.Integer(),
  createdAt: Type.String(),
  tentNr: Type.Integer(),
});

export const TentInfoSchema = Type.Object({
  campers: Type.Array(Type.String()),
  scores: Type.Array(TentScoreSchema),
});

export type TentInfo = Static<typeof TentInfoSchema>;

// --- Billing schemas (from schemas/billing.ts) ---

export const ChildBillSchema = Type.Object({
  childName: Type.String(),
  pricePaid: Type.Integer(),
  priceToPay: Type.Integer(),
  shiftNr: Type.Integer(),
  billSent: Type.Boolean(),
});

export const ParentBillSchema = Type.Object({
  name: Type.String(),
  email: Type.String(),
  billNr: Type.Union([Type.Null(), Type.Integer()]),
  records: Type.Array(ChildBillSchema),
});

export type ParentBillData = Static<typeof ParentBillSchema>;

// --- Staff schemas (from schemas/staff.ts) ---

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

// --- Response data wrappers ---

export const FetchShiftsData = Type.Object({
  shifts: Type.Array(Type.Integer()),
});

export const FetchShiftPdfFailData = Type.Union([
  Type.Object({ shift: Type.String() }),
]);

export const FetchShiftUsersData = Type.Object({
  users: Type.Array(UserWithShiftRoleSchema),
});

export const FetchShiftRecordsData = Type.Object({
  records: Type.Array(CamperRecordSchema),
});

export const FetchShiftEmailsData = Type.Object({
  emails: Type.Array(Type.String()),
});

export const FetchShiftBillingData = Type.Object({
  records: Type.Array(ParentBillSchema),
});

export const FetchShiftStaffData = Type.Object({
  staff: Type.Array(ShiftStaffSchema),
});

export const FetchTentsData = Type.Object({
  scores: Type.Array(TentScoreSchema),
});
