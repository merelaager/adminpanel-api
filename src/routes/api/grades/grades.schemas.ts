import { Type } from "@sinclair/typebox";

export const GradeParamsSchema = Type.Object({
  gradeId: Type.Integer(),
});

export const PatchGradeSchema = Type.Object({
  score: Type.Integer({ minimum: 0, maximum: 255 }),
});

export const PatchGradeFailDataNF = Type.Object({
  gradeId: Type.String(),
});
