import type { Prisma } from "#app/generated/prisma/client";

import prisma from "#app/lib/prisma";
import { getChildAgeAtShiftStart } from "#app/lib/age";
import { getCurrentCampYear } from "#app/lib/camp-year";

type RecordCreateData = {
  childId: number;
  shiftNr: number;
};

export const toggleRecord = async (
  recordBasis: RecordCreateData,
  isRegistered: boolean,
  tx: Prisma.TransactionClient = prisma,
) => {
  const { childId, shiftNr } = recordBasis;
  const currentYear = getCurrentCampYear();

  // If the record exists, toggle it on/off.
  // Else, create the record, e.g. when the registration is first approved.
  await tx.record.upsert({
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
      ageAtCamp: await getChildAgeAtShiftStart(childId, shiftNr),
    },
  });
};
