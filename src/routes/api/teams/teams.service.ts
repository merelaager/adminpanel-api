import { Prisma } from "#app/generated/prisma/client";

import prisma from "#app/lib/prisma";
import { getCurrentCampYear } from "#app/lib/camp-year";

import type { TeamRecord } from "./teams.schemas";

export const fetchTeams = async (shiftNr: number): Promise<TeamRecord[]> => {
  return prisma.team.findMany({
    where: { shiftNr, year: getCurrentCampYear() },
    select: {
      id: true,
      shiftNr: true,
      name: true,
      year: true,
      place: true,
      captainId: true,
    },
  });
};

export type CreateTeamResult = "created" | "duplicate";

export const createTeam = async (
  shiftNr: number,
  name: string,
): Promise<CreateTeamResult> => {
  try {
    await prisma.team.create({
      data: { shiftNr, name, year: getCurrentCampYear() },
    });
    return "created";
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return "duplicate";
    }
    throw err;
  }
};
