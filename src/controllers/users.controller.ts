import { Prisma, PrismaClient } from "@prisma/client";
import { Static } from "@sinclair/typebox";

import { UserCreateSchema } from "../schemas/user";

export type UserCreateBasis = Static<typeof UserCreateSchema>;

export const getUsers = async (prisma: PrismaClient) => {
  return prisma.user.findMany();
};

export const createUser = async (
  userData: UserCreateBasis,
  prisma: PrismaClient,
) => {
  // TODO: find a TS-compatible way to include the role in the user creation.
  const userCreationData: Prisma.UserCreateArgs = {
    data: {
      username: userData.username,
      name: userData.name,
      email: userData.email,
      password: userData.password,
      nickname: userData.nickname,
    },
  };

  try {
    const createdUser = await prisma.user.create(userCreationData);
    return { success: true, data: createdUser };
  } catch (err: unknown) {
    console.error(err);

    let errorMessage = "Internal Server Error";
    let isUserError = false;

    // Email enumeration is partly mitigated by having
    // user creation be restricted to administrators.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        switch (err.meta?.target) {
          case "username":
            errorMessage = "Username already exists";
            isUserError = true;
            break;
          case "email":
            errorMessage = "Email already exists";
            isUserError = true;
            break;
        }
      }
    }

    return { success: false, userError: isUserError, error: errorMessage };
  }
};
