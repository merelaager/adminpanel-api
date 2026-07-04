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

export const createTeam = async (
  shiftNr: number,
  name: string,
): Promise<void> => {
  await prisma.team.create({
    data: { shiftNr, name, year: getCurrentCampYear() },
  });
};
