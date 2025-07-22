import { Static, Type } from "@sinclair/typebox";

export const GradeDeleteSchema = Type.Object({
  gradeId: Type.Number(),
});

export type GradeDeleteParams = Static<typeof GradeDeleteSchema>;
