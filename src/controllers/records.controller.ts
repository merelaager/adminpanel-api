import { PrismaClient } from "@prisma/client";

type RecordCreateData = {
  childId: number;
  shiftNr: number;
};

export const toggleRecord = async (
  recordBasis: RecordCreateData,
  isRegistered: boolean,
  prisma: PrismaClient,
) => {
  const { childId, shiftNr } = recordBasis;
  const currentYear = new Date().getFullYear();

  // If the record exists, toggle it on/off.
  // Else, create the record, e.g. when the registration is first approved.
  await prisma.record.upsert({
    where: {
      metaId: {
        childId,
        shiftNr,
        year: currentYear,
      },
    },
    update: {
      isActive: isRegistered,
    },
    create: {
      childId,
      shiftNr,
      year: currentYear,
    },
  });
};
