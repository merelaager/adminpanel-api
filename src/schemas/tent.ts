import { Static, Type } from "@sinclair/typebox";

export const TentInfoSchema = Type.Object({
  campers: Type.Array(Type.String()),
  scores: Type.Array(
    Type.Object({
      score: Type.Number(),
      createdAt: Type.String(),
    }),
  ),
});

export type TentInfo = Static<typeof TentInfoSchema>;
