import { Static, Type } from "@sinclair/typebox";

export type FetchTeamsQueryString = Static<typeof TeamsFetchSchema>;

export const TeamsFetchSchema = Type.Object({
  shiftNr: Type.Integer(),
});

export type TeamCreationBody = Static<typeof TeamCreationSchema>;

export const TeamCreationSchema = Type.Object({
  shiftNr: Type.Integer(),
  name: Type.String(),
});

export type TeamRecord = Static<typeof TeamRecordSchema>;

export const TeamRecordSchema = Type.Object({
  id: Type.Integer(),
  shiftNr: Type.Integer(),
  name: Type.String(),
  year: Type.Integer(),
  place: Type.Union([Type.Integer(), Type.Null()]),
  captainId: Type.Union([Type.Integer(), Type.Null()]),
});
