import prisma from "#app/lib/prisma";
import { canEditShiftBasic } from "#app/lib/permissions";
import { logChanges } from "#app/services/change-log.service";

export const deleteGrade = async (
  userId: number,
  gradeId: number,
): Promise<boolean> => {
  const grade = await prisma.tentScore.findUnique({
    where: { id: gradeId },
  });

  if (!grade) return true;

  const isAuthorised = await canEditShiftBasic(userId, grade.shiftNr);
  if (!isAuthorised) return false;

  await prisma.$transaction(async (tx) => {
    // Use deleteMany as the grade may not exist.
    await tx.tentScore.deleteMany({
      where: { id: gradeId },
    });

    await logChanges(
      [
        {
          userId,
          entity: "grade",
          entityId: gradeId,
          childId: null,
          shiftNr: grade.shiftNr,
          field: "score",
          oldValue: grade.score,
          newValue: null,
        },
      ],
      tx,
    );
  });

  return true;
};

export type PatchGradeResult = "not-found" | "forbidden" | "success";

export const patchGrade = async (
  userId: number,
  gradeId: number,
  score: number,
): Promise<PatchGradeResult> => {
  const grade = await prisma.tentScore.findUnique({
    where: { id: gradeId },
    select: { shiftNr: true, score: true },
  });

  if (grade === null) return "not-found";

  const isAuthorised = await canEditShiftBasic(userId, grade.shiftNr);
  if (!isAuthorised) return "forbidden";

  const scoreChanged = score !== grade.score;

  await prisma.$transaction(async (tx) => {
    await tx.tentScore.updateMany({
      where: { id: gradeId },
      data: { score, userId },
    });

    if (scoreChanged) {
      await logChanges(
        [
          {
            userId,
            entity: "grade",
            entityId: gradeId,
            childId: null,
            shiftNr: grade.shiftNr,
            field: "score",
            oldValue: grade.score,
            newValue: score,
          },
        ],
        tx,
      );
    }
  });

  return "success";
};
