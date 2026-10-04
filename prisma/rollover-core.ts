import fs from "node:fs/promises";
import path from "node:path";

import type { PrismaClient } from "#app/generated/prisma/client";
import { TOKEN_EXPIRY_MS } from "#app/constants/auth";
import { fetchShiftEmails } from "#app/routes/api/shifts/shifts.service";

// End-of-season cleanup, implementing the privacy policy's retention rules.
// https://merelaager.ee/oiguslik/isikuandmed/
//
// - ID codes of children over 18 are deleted.
// - Registrations are deleted, but parent emails are exported to a .txt file
//   for upload to the mailing list.
// - Staff permissions are cleared, root users keep their shift roles.
// - Spent signup and password-reset tokens are deleted.
// - Camper-list PDFs are deleted, Bbill PDFs are archived.

export interface RolloverOptions {
  // Current year.
  year: number;
  // Dry-run if false.
  apply: boolean;
  // Base data directory (e.g. for bills under <dataDir>/arved).
  dataDir: string;
}

export interface RolloverResult {
  idCodesCleared: number;
  idCodesWithoutBirthYear: number;
  registrationsDeleted: number;
  emailFiles: EmailFile[];
  userRolesDeleted: number;
  signupTokensDeleted: number;
  resetTokensDeleted: number;
  camperListsDeleted: number;
  billsArchived: number;
  billsArchiveDir: string;
}

const listPdfs = async (dir: string): Promise<string[]> => {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((entry) => entry.endsWith(".pdf"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
};

type EmailFile = { shiftNr: number; file: string; count: number };

// Must run before registrations are deleted.
const exportParentEmails = async (
  client: PrismaClient,
  year: number,
  apply: boolean,
  dataDir: string,
): Promise<EmailFile[]> => {
  const shifts = await client.registration.findMany({
    where: { isRegistered: true },
    distinct: ["shiftNr"],
    select: { shiftNr: true },
    orderBy: { shiftNr: "asc" },
  });

  if (apply) await fs.mkdir(dataDir, { recursive: true });

  const emailFiles: EmailFile[] = [];
  for (const { shiftNr } of shifts) {
    const emails = await fetchShiftEmails(shiftNr);
    const file = path.join(dataDir, `parent-emails-${year}-${shiftNr}v.txt`);
    if (apply) {
      await fs.writeFile(file, emails.join("\n") + "\n", { mode: 0o600 });
    }
    emailFiles.push({ shiftNr, file, count: emails.length });
  }
  return emailFiles;
};

const cleanDatabase = async (
  client: PrismaClient,
  year: number,
  apply: boolean,
) => {
  const adultChildren = {
    idCode: { not: null },
    birthYear: { lte: year - 18 },
  };
  const nonRootUserRoles = { user: { role: { not: "root" as const } } };
  const tokenCutoff = new Date(Date.now() - TOKEN_EXPIRY_MS);
  const spentSignupTokens = {
    OR: [
      { isExpired: true },
      { usedDate: { not: null } },
      { createdAt: { lt: tokenCutoff } },
    ],
  };
  const spentResetTokens = {
    OR: [{ isExpired: true }, { createdAt: { lt: tokenCutoff } }],
  };

  const idCodesWithoutBirthYear = await client.child.count({
    where: { idCode: { not: null }, birthYear: null },
  });

  if (!apply) {
    const [
      idCodesCleared,
      registrationsDeleted,
      userRolesDeleted,
      signupTokensDeleted,
      resetTokensDeleted,
    ] = await Promise.all([
      client.child.count({ where: adultChildren }),
      client.registration.count(),
      client.userRoles.count({ where: nonRootUserRoles }),
      client.signupToken.count({ where: spentSignupTokens }),
      client.resetToken.count({ where: spentResetTokens }),
    ]);
    return {
      idCodesCleared,
      idCodesWithoutBirthYear,
      registrationsDeleted,
      userRolesDeleted,
      signupTokensDeleted,
      resetTokensDeleted,
    };
  }

  return client.$transaction(async (tx) => ({
    idCodesCleared: (
      await tx.child.updateMany({
        where: adultChildren,
        data: { idCode: null },
      })
    ).count,
    idCodesWithoutBirthYear,
    registrationsDeleted: (await tx.registration.deleteMany()).count,
    userRolesDeleted: (
      await tx.userRoles.deleteMany({ where: nonRootUserRoles })
    ).count,
    signupTokensDeleted: (
      await tx.signupToken.deleteMany({ where: spentSignupTokens })
    ).count,
    resetTokensDeleted: (
      await tx.resetToken.deleteMany({ where: spentResetTokens })
    ).count,
  }));
};

const cleanFiles = async (year: number, apply: boolean, dataDir: string) => {
  const camperListDir = path.join(dataDir, "files");
  const billDir = path.join(dataDir, "arved");
  const billsArchiveDir = path.join(dataDir, "arved-archive", String(year));

  const [camperLists, bills] = await Promise.all([
    listPdfs(camperListDir),
    listPdfs(billDir),
  ]);

  if (apply) {
    for (const file of camperLists) {
      await fs.rm(path.join(camperListDir, file));
    }
    if (bills.length > 0) {
      await fs.mkdir(billsArchiveDir, { recursive: true });
      for (const file of bills) {
        await fs.rename(
          path.join(billDir, file),
          path.join(billsArchiveDir, file),
        );
      }
    }
  }

  return {
    camperListsDeleted: camperLists.length,
    billsArchived: bills.length,
    billsArchiveDir,
  };
};

export const runRollover = async (
  client: PrismaClient,
  { year, apply, dataDir }: RolloverOptions,
): Promise<RolloverResult> => {
  const emailFiles = await exportParentEmails(client, year, apply, dataDir);
  const database = await cleanDatabase(client, year, apply);
  const files = await cleanFiles(year, apply, dataDir);
  return { emailFiles, ...database, ...files };
};
