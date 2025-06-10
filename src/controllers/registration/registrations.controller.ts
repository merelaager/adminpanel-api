import { FastifyReply, FastifyRequest, RouteGenericInterface } from "fastify";
import { StatusCodes } from "http-status-codes";
import type { PrismaClient, Registration } from "@prisma/client";

import prisma from "../../utils/prisma";

import { toggleRecord } from "../records.controller";

import {
  FetchRegistrationsQueryString,
  FilteredRegistrationSchema,
  PatchRegistrationBody,
} from "../../schemas/registration";

import type { JSendResponse } from "../../types/jsend";

const fetchUserShiftPermissions = async (
  userId: number,
  shiftNr: number,
  permissionPrefix: string,
) => {
  const userShiftRolesRaw = await prisma.userRoles.findMany({
    where: { userId, shiftNr },
    select: {
      role: {
        select: {
          role_permissions: {
            where: {
              permission: {
                permissionName: { startsWith: permissionPrefix },
              },
            },
            select: { permission: { select: { permissionName: true } } },
          },
        },
      },
    },
  });

  const shiftPermissions = new Set<string>();
  for (const shiftRole of userShiftRolesRaw) {
    for (const permission of shiftRole.role.role_permissions) {
      shiftPermissions.add(permission.permission.permissionName);
    }
  }

  return shiftPermissions;
};

const objectHasAllowedKey = <
  FullModel extends object,
  Patch extends Partial<FullModel>,
>(
  obj: Patch,
  allowedKeys: readonly (keyof FullModel)[],
): boolean => {
  return allowedKeys.some((key) => key in obj);
};

// Keep this function for potential future use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onlyHasAllowedKeys = <
  FullModel extends object,
  Patch extends Partial<FullModel>,
>(
  obj: Patch,
  allowedKeys: readonly (keyof FullModel)[],
): boolean => {
  return Object.keys(obj).every((key) =>
    allowedKeys.includes(key as keyof FullModel),
  );
};

interface IRegistrationsFetchHandler extends RouteGenericInterface {
  Querystring: FetchRegistrationsQueryString;
  Response: JSendResponse;
}

export const registrationsFetchHandler = async (
  req: FastifyRequest<IRegistrationsFetchHandler>,
  res: FastifyReply<IRegistrationsFetchHandler>,
): Promise<never> => {
  const { userId } = req.session.user;
  const { shiftNr } = req.query;

  if (!shiftNr) {
    return res.status(StatusCodes.NOT_IMPLEMENTED).send({
      status: "error",
      message: "Provide a query string for the shift, i.e. ?shiftNr=X",
    });
  }

  // Fetch the user's registration view permissions for the given shift.
  const shiftViewPermissions = await fetchUserShiftPermissions(
    userId,
    shiftNr,
    "registration.view",
  );
  if (shiftViewPermissions.size === 0) {
    return res
      .status(StatusCodes.OK)
      .send({ status: "success", data: { registrations: [] } });
  }

  const canViewPII =
    shiftViewPermissions.has("registration.view.full") ||
    shiftViewPermissions.has("registration.view.personal-info");

  const canViewFinancial =
    shiftViewPermissions.has("registration.view.full") ||
    shiftViewPermissions.has("registration.view.price");

  const canViewContact =
    shiftViewPermissions.has("registration.view.full") ||
    shiftViewPermissions.has("registration.view.contact");

  const rawRegistrations = await prisma.registration.findMany({
    where: { shiftNr },
    select: {
      id: true,
      childId: true,
      child: {
        select: {
          name: true,
          sex: true,
        },
      },
      shiftNr: true,
      isRegistered: true,
      regOrder: true,
      isOld: true,
      tsSize: true,
      // PII permission needed
      birthday: true, // We need this to calculate the age in years.
      road: canViewPII,
      county: canViewPII,
      country: canViewPII,
      // Financial permission needed
      pricePaid: canViewFinancial,
      priceToPay: canViewFinancial,
      notifSent: canViewFinancial,
      billId: canViewFinancial,
      // Contact permission needed
      contactName: canViewContact,
      contactNumber: canViewContact,
      contactEmail: canViewContact,
      backupTel: canViewContact,
    },
  });

  const currentDate = new Date();

  const registrations: FilteredRegistrationSchema[] = rawRegistrations.map(
    (registration) => {
      const birthday = registration.birthday;
      let age = currentDate.getUTCFullYear() - birthday.getUTCFullYear();
      if (birthday.getUTCMonth() < currentDate.getUTCMonth()) {
        age -= 1;
      } else if (
        birthday.getUTCMonth() === currentDate.getUTCMonth() &&
        birthday.getUTCDate() < currentDate.getUTCDate()
      ) {
        age -= 1;
      }

      // TODO: in the future, compute the age that the child will have at camp during registration.
      // Then we can simply fetch this from the database later on.

      // Quite inelegant to have to reconstruct the object this way,
      // but it is necessary to expose the age of campers without exposing their birthday,
      // which could be considered more sensitive.
      const child = { ...registration.child, currentAge: age };
      const newRegistration: FilteredRegistrationSchema = {
        ...registration,
        birthday: birthday.toISOString(),
        child,
      };
      if (!canViewPII) {
        delete newRegistration.birthday;
      }
      return newRegistration;
    },
  );

  return res
    .status(StatusCodes.OK)
    .send({ status: "success", data: { registrations } });
};

export const patchRegistrationData = async (
  userId: number,
  regId: number,
  patchData: PatchRegistrationBody,
  prisma: PrismaClient,
) => {
  // TODO: avoid an extra request by querying the shift of the registration.
  // Get the shift of the registration and the child the registration pertains to.
  const regShift = await prisma.registration.findUnique({
    where: { id: regId },
    select: { shiftNr: true, childId: true },
  });

  if (!regShift) {
    return false;
  }

  // Fetch the user's registration edit permissions for the given shift.
  const regEditPermissions = await fetchUserShiftPermissions(
    userId,
    regShift.shiftNr,
    "registration.edit",
  );

  if (regEditPermissions.size === 0) return false;

  const canEditPrice = regEditPermissions.has("registration.edit.price");
  const priceEditKeys = [
    "pricePaid",
    "priceToPay",
  ] as const satisfies readonly (keyof Registration)[];
  if (!canEditPrice && objectHasAllowedKey(patchData, priceEditKeys)) {
    return false;
  }

  const canEditRegistration = regEditPermissions.has(
    "registration.edit.isRegistered",
  );
  const regEditKeys = [
    "isOld",
    "isRegistered",
  ] as const satisfies readonly (keyof Registration)[];
  if (!canEditRegistration && objectHasAllowedKey(patchData, regEditKeys)) {
    return false;
  }

  // Additional manual checking is not necessary, as this is taken
  // care of by the request validation based on the JSON schema.
  // Still, keep it here (commented out) for an example or future needs.
  // const allAllowedKeys = [
  //   ...priceEditKeys,
  //   ...regEditKeys,
  // ] as const satisfies readonly (keyof Registration)[];
  // if (!onlyHasAllowedKeys(patchData, allAllowedKeys)) {
  //   return false;
  // }

  await prisma.registration.update({
    where: { id: regId },
    data: patchData,
  });

  // If the child is registered, the camp record must be updated accordingly.
  // Likewise, if the child was de-registered.
  const isRegisteredKey = "isRegistered" satisfies keyof Registration;
  if (
    isRegisteredKey in patchData &&
    typeof patchData[isRegisteredKey] === "boolean"
  ) {
    await toggleRecord(
      {
        childId: regShift.childId,
        shiftNr: regShift.shiftNr,
      },
      patchData[isRegisteredKey],
    );
  }

  return true;
};
