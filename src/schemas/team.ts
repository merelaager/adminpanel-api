import { Static, Type } from "@sinclair/typebox";

export const TeamsFetchSchema = Type.Object({
  shiftNr: Type.Integer(),
});

export const TeamCreationSchema = Type.Object({
  shiftNr: Type.Integer(),
  name: Type.String({ minLength: 1 }),
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
