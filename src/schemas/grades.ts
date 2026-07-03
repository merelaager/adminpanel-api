import { Static, Type } from "@sinclair/typebox";

export const GradeDeleteSchema = Type.Object({
  gradeId: Type.Integer(),
});

export type GradeDeleteParams = Static<typeof GradeDeleteSchema>;
