import { Static, Type } from "@sinclair/typebox";

export const TentScoreSchema = Type.Object({
  scoreId: Type.Number(),
  score: Type.Number(),
  createdAt: Type.String(),
  tentNr: Type.Number(),
});

export const TentInfoSchema = Type.Object({
  campers: Type.Array(Type.String()),
  scores: Type.Array(TentScoreSchema),
});

export type TentInfo = Static<typeof TentInfoSchema>;
