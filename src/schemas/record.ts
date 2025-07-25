import { Static, Type } from "@sinclair/typebox";

export type FetchRecordsQueryString = Static<typeof RecordsFetchSchema>;

export const RecordsFetchSchema = Type.Object({
  shiftNr: Type.Integer(),
});

export type ForceSyncBody = Static<typeof ForceSyncSchema>;

export const ForceSyncSchema = Type.Object({
  shiftNr: Type.Integer(),
  forceSync: Type.Boolean(), // Make intent explicit, just in case.
});

export type FlattenedRecord = Static<typeof FlattenedRecordSchema>;

export const FlattenedRecordSchema = Type.Object({
  id: Type.Integer(),
  childId: Type.Integer(),
  childName: Type.String(),
  teamId: Type.Union([Type.Number(), Type.Null()]),
  teamName: Type.Union([Type.String(), Type.Null()]),
  tentNr: Type.Union([Type.Number(), Type.Null()]),
  isPresent: Type.Boolean(),
  ageAtCamp: Type.Integer(),
});

export type RecordParams = Static<typeof RecordParamsSchema>;

export const RecordParamsSchema = Type.Object({
  recordId: Type.Integer(),
});

export type PatchRecordBody = Static<typeof PatchRecordSchema>;

export const PatchRecordSchema = Type.Partial(
  Type.Object(
    {
      // Null must be first to avoid null being parsed as 0.
      teamId: Type.Union([Type.Null(), Type.Integer()]),
      tentNr: Type.Union([Type.Null(), Type.Integer()]),
      isPresent: Type.Boolean(),
    },
    {
      additionalProperties: false,
    },
  ),
);
