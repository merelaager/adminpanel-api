import prisma from "#app/lib/prisma";
import { canEditShiftBasic } from "#app/lib/permissions";

// Returns false when the grade exists but the user may not edit its shift.
// A missing grade is a no-op and reported as success.
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

  // Use deleteMany to prevent potential rate with regular delete.
  await prisma.tentScore.deleteMany({
    where: { id: gradeId },
  });

  return true;
};
