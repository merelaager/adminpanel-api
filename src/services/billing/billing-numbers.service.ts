import type {
  Prisma,
  billing_counter_kind,
} from "#app/generated/prisma/client";
import { createReferenceNumber } from "#app/lib/reference-number";

const MAX_BILLS_PER_SEASON = 999;
const MAX_ACCOUNTS_PER_SEASON = 999;

const nextCounterValue = async (
  tx: Prisma.TransactionClient,
  season: number,
  kind: billing_counter_kind,
): Promise<number> => {
  // Locks the row until the transaction ends.
  await tx.$executeRaw`
    INSERT INTO billing_counters (season, kind, lastValue)
    VALUES (${season}, ${kind}, 1)
    ON DUPLICATE KEY UPDATE lastValue = lastValue + 1`;

  const counter = await tx.billingCounter.findUniqueOrThrow({
    where: { season_kind: { season, kind } },
    select: { lastValue: true },
  });
  return counter.lastValue;
};

const twoDigitYear = (season: number): number => season % 100;

export const allocateBillNumber = async (
  tx: Prisma.TransactionClient,
  season: number,
): Promise<number> => {
  const value = await nextCounterValue(tx, season, "bill");
  if (value > MAX_BILLS_PER_SEASON) {
    throw new Error(`Season ${season} has run out of bill numbers`);
  }
  return season * 1000 + value;
};

export const allocateAccountReference = async (
  tx: Prisma.TransactionClient,
  season: number,
): Promise<string> => {
  const value = await nextCounterValue(tx, season, "account");
  if (value > MAX_ACCOUNTS_PER_SEASON) {
    throw new Error(`Season ${season} has run out of account references`);
  }
  return createReferenceNumber(
    `${twoDigitYear(season)}${String(value).padStart(3, "0")}`,
  );
};
