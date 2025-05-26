import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

import { Credentials } from "../schemas/auth";

export const authenticateUser = async (
  { username, password }: Credentials,
  prisma: PrismaClient,
) => {
  const user = await prisma.user.findUnique({
    where: {
      username: username.trim().toLowerCase(),
    },
  });

  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;

  return user;
};
