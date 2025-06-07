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

export type FlattenedRecord = Static<typeof FlattenedRecord>;

export const FlattenedRecord = Type.Object({
  id: Type.Integer(),
  childId: Type.Integer(),
  childName: Type.String(),
  teamId: Type.Union([Type.Number(), Type.Null()]),
  teamName: Type.Union([Type.String(), Type.Null()]),
  tentNr: Type.Union([Type.Number(), Type.Null()]),
  isPresent: Type.Boolean(),
});
