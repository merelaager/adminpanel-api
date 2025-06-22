import prisma from "./prisma";

export const getAgeAtDate = (birthday: Date, targetDate: Date) => {
  let ageAtTarget = targetDate.getUTCFullYear() - birthday.getUTCFullYear();
  if (targetDate.getUTCMonth() < birthday.getUTCMonth()) {
    ageAtTarget -= 1;
  } else if (
    targetDate.getUTCMonth() === birthday.getUTCMonth() &&
    targetDate.getUTCDate() < birthday.getUTCDate()
  ) {
    ageAtTarget -= 1;
  }

  return ageAtTarget;
};

export const getChildAgeAtShiftStart = async (
  childId: number,
  shiftNr: number,
) => {
  const shiftInfo = await prisma.shiftInfo.findUnique({
    where: { id: shiftNr },
    select: { startDate: true },
  });

  if (!shiftInfo) return 0;

  const registration = await prisma.registration.findFirst({
    where: { childId },
    select: { birthday: true },
  });

  if (!registration) return 0;

  return getAgeAtDate(registration.birthday, shiftInfo.startDate);
};
