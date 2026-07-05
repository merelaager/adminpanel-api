import { Static, Type } from "@sinclair/typebox";

export const RecordsFetchSchema = Type.Object(
  {
    shiftNr: Type.Optional(Type.Integer()),
    childId: Type.Optional(Type.Integer()),
  },
  {
    additionalProperties: false,
    description:
      "Filter by shift (current year), by child (all years), or by both. At least one is required.",
    anyOf: [{ required: ["shiftNr"] }, { required: ["childId"] }],
  },
);

export type RecordsFetchQuery = Static<typeof RecordsFetchSchema>;

export const ForceSyncSchema = Type.Object({
  shiftNr: Type.Integer(),
  forceSync: Type.Boolean(), // Make intent explicit, just in case.
});

export type FlattenedRecord = Static<typeof FlattenedRecordSchema>;

export const FlattenedRecordSchema = Type.Object({
  id: Type.Integer(),
  childId: Type.Integer(),
  childName: Type.String(),
  teamId: Type.Union([Type.Integer(), Type.Null()]),
  teamName: Type.Union([Type.String(), Type.Null()]),
  tentNr: Type.Union([Type.Integer(), Type.Null()]),
  isPresent: Type.Boolean(),
  ageAtCamp: Type.Integer(),
  year: Type.Integer(),
  shiftNr: Type.Integer(),
});

export const FetchRecordsData = Type.Object({
  records: Type.Array(FlattenedRecordSchema),
});

export const RecordParamsSchema = Type.Object({
  recordId: Type.Integer(),
});

export const PatchRecordSchema = Type.Partial(
  Type.Object(
    {
      // Null must be first to avoid null being parsed as 0.
      teamId: Type.Union([Type.Null(), Type.Integer()]),
      tentNr: Type.Union([
        Type.Null(),
        Type.Integer({ minimum: 1, maximum: 10 }),
      ]),
      isPresent: Type.Boolean(),
    },
    {
      additionalProperties: false,
    },
  ),
);

export type PatchRecordBody = Static<typeof PatchRecordSchema>;

export const PatchRecordFailDataNF = Type.Object({
  recordId: Type.String(),
});

export const PatchRecordFailDataUE = Type.Object({ teamId: Type.String() });
