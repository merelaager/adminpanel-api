import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import prisma from "#app/lib/prisma";
import { getCurrentCampYear } from "#app/lib/camp-year";
import { runRollover, type RolloverResult } from "./rollover-core";

// Usage: yarn rollover            (dry run)
//        yarn rollover --apply    (execute after confirmation)
const apply = process.argv.includes("--apply");
const year = getCurrentCampYear();

const printSummary = (result: RolloverResult, applied: boolean) => {
  const verb = applied ? "" : "would be ";
  console.log(
    [
      `ID codes ${verb}cleared (turned 18 by ${year}): ${result.idCodesCleared}`,
      `Registrations ${verb}deleted: ${result.registrationsDeleted}`,
      ...result.emailFiles.map(
        ({ shiftNr, file, count }) =>
          `Shift ${shiftNr} parent emails ${verb}exported: ${count} -> ${file}`,
      ),
      `Non-root user roles ${verb}deleted: ${result.userRolesDeleted}`,
      `Spent signup tokens ${verb}deleted: ${result.signupTokensDeleted}`,
      `Spent reset tokens ${verb}deleted: ${result.resetTokensDeleted}`,
      `Camper-list PDFs ${verb}deleted: ${result.camperListsDeleted}`,
      `Bill PDFs ${verb}archived: ${result.billsArchived} -> ${result.billsArchiveDir}`,
    ].join("\n"),
  );

  if (result.idCodesWithoutBirthYear > 0) {
    console.warn(
      `WARNING: ${result.idCodesWithoutBirthYear} children have an ID code ` +
        "but no birth year.",
    );
  }
};

const confirmApply = async (databaseName: string): Promise<boolean> => {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `\nType the database name (${databaseName}) to apply: `,
    );
    return answer.trim() === databaseName;
  } finally {
    rl.close();
  }
};

const main = async () => {
  const databaseName = process.env.DATABASE_NAME ?? "";
  const options = { year, dataDir: path.resolve("data") };

  console.log(
    `Season ${year} rollover on ${databaseName}@${process.env.DATABASE_HOST}\n`,
  );
  printSummary(await runRollover(prisma, { ...options, apply: false }), false);

  if (!apply) {
    console.log("\nRe-run with --apply to perform the cleanup.");
    return;
  }

  if (!(await confirmApply(databaseName))) {
    console.log("Aborted, nothing was changed.");
    return;
  }

  printSummary(await runRollover(prisma, { ...options, apply: true }), true);
  console.log(
    "\nNext: upload the parent-emails-*.txt files to the mailing list, " +
      "then delete them.",
  );
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
