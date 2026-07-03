import { Static, Type } from "@sinclair/typebox";

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
