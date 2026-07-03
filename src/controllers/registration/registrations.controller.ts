import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";
import type { PrismaClient, Registration } from "#app/generated/prisma/client";

import prisma from "#app/utils/prisma";
import { getSessionUser } from "#app/utils/session";
import { getAgeAtDate } from "#app/utils/age";
import { isSuperRoot } from "#app/utils/permissions";
import { Permissions, PermissionPrefixes } from "#app/constants/permissions";

import { toggleRecord } from "#app/controllers/records.controller";

import {
  FilteredRegistrationSchema,
  PatchRegistrationBody,
  RegistrationsFetchSchema,
} from "#app/schemas/registration";

import type { JSendError, JSendResponse } from "#app/schemas/jsend";
import { UnknownData } from "#app/schemas/jsend";
import type { Route } from "#app/schemas/route";

export const fetchUserShiftPermissions = async (
  userId: number,
  shiftNr: number,
  permissionPrefix: PermissionPrefixes,
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

type IRegistrationsFetchHandler = Route<{
  querystring: typeof RegistrationsFetchSchema;
}> & {
  Reply: JSendResponse<typeof UnknownData, typeof UnknownData> | JSendError;
};

export const registrationsFetchHandler = async (
  req: FastifyRequest<IRegistrationsFetchHandler>,
  res: FastifyReply<IRegistrationsFetchHandler>,
): Promise<never> => {
  const { userId } = getSessionUser(req);
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
    PermissionPrefixes.REGISTRATION_VIEW,
  );
  if (shiftViewPermissions.size === 0) {
    return res
      .status(StatusCodes.OK)
      .send({ status: "success", data: { registrations: [] } });
  }

  const canViewPII =
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_FULL) ||
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_PERSONAL_INFO);

  const canViewFinancial =
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_FULL) ||
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_PRICE);

  const canViewContact =
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_FULL) ||
    shiftViewPermissions.has(Permissions.VIEW_REGISTRATION_CONTACT);

  const rawRegistrations = await prisma.registration.findMany({
    where: { shiftNr, visible: true },
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
      addendum: canViewPII,
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
      // TODO: in the future, compute the age that the child will have at camp during registration.
      // Then we can simply fetch this from the database later on.

      // Quite inelegant to have to reconstruct the object this way,
      // but it is necessary to expose the age of campers without exposing their birthday,
      // which could be considered more sensitive.
      const child = {
        ...registration.child,
        currentAge: getAgeAtDate(registration.birthday, currentDate),
      };
      const newRegistration: FilteredRegistrationSchema = {
        ...registration,
        birthday: registration.birthday.toISOString(),
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
    PermissionPrefixes.REGISTRATION_EDIT,
  );

  if (regEditPermissions.size === 0) return false;

  const canEditPrice = regEditPermissions.has(
    Permissions.EDIT_REGISTRATION_PRICE,
  );
  const priceEditKeys = [
    "pricePaid",
    "priceToPay",
  ] as const satisfies readonly (keyof Registration)[];
  if (!canEditPrice && objectHasAllowedKey(patchData, priceEditKeys)) {
    return false;
  }

  const canEditRegistration = regEditPermissions.has(
    Permissions.EDIT_REGISTRATION_IS_REGISTERED,
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

type IRegistrationsCampersSyncHandler = RouteGenericInterface & {
  Reply: void;
};

export const registrationsCampersSyncHandler = async (
  req: FastifyRequest<IRegistrationsCampersSyncHandler>,
  res: FastifyReply<IRegistrationsCampersSyncHandler>,
): Promise<never> => {
  const { userId } = getSessionUser(req);
  if (!(await isSuperRoot(userId)))
    return res.status(StatusCodes.FORBIDDEN).send();

  const registrations = await prisma.registration.findMany();

  for (const registration of registrations) {
    if (registration.idCode === null) continue;

    await prisma.child.update({
      where: { id: registration.childId },
      data: {
        idCode: registration.idCode,
        birthYear: registration.birthday.getUTCFullYear(),
      },
    });
  }

  return res.status(StatusCodes.NO_CONTENT).send();
};
