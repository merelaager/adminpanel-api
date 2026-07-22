import type { Prisma, change_log_entity } from "#app/generated/prisma/client";

import prisma from "#app/lib/prisma";

export type ChangeLogEntry = {
  userId: number;
  entity: change_log_entity;
  entityId: number;
  childId: number | null;
  shiftNr: number;
  field: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
};

const stringifyValue = (value: ChangeLogEntry["oldValue"]): string | null =>
  value === null ? null : String(value);

export const logChanges = async (
  entries: ChangeLogEntry[],
  tx: Prisma.TransactionClient = prisma,
): Promise<void> => {
  if (entries.length === 0) return;

  await tx.changeLog.createMany({
    data: entries.map((entry) => ({
      ...entry,
      oldValue: stringifyValue(entry.oldValue),
      newValue: stringifyValue(entry.newValue),
    })),
  });
};
