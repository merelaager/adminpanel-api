import type { Registration } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

import { toggleRecord } from "../records.controller";

import { PatchRegistrationBody } from "../../schemas/registration";

const fetchUserShiftPermissions = async (
  userId: number,
  shiftNr: number,
  permissionPrefix: string,
  prisma: PrismaClient,
) => {
  const userShiftRolesRaw = await prisma.userRoles.findMany({
    where: { userId, shiftNr },
    select: {
      roles: {
        select: {
          role_permissions: {
            where: {
              permissions: {
                permissionName: { startsWith: permissionPrefix },
              },
            },
            select: { permissions: { select: { permissionName: true } } },
          },
        },
      },
    },
  });

  const shiftPermissions = new Set<string>();
  for (const role of userShiftRolesRaw) {
    for (const permission of role.roles.role_permissions) {
      shiftPermissions.add(permission.permissions.permissionName);
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

export const fetchShiftRegistrations = async (
  userId: number,
  shiftNr: number,
  prisma: PrismaClient,
) => {
  // Fetch the user's registration view permissions for the given shift.
  const shiftViewPermissions = await fetchUserShiftPermissions(
    userId,
    shiftNr,
    "registration.view",
    prisma,
  );
  if (shiftViewPermissions.size === 0) return [];

  const canViewPII =
    shiftViewPermissions.has("registration.view.full") ||
    shiftViewPermissions.has("registration.view.personal-info");

  const canViewFinancial =
    shiftViewPermissions.has("registration.view.full") ||
    shiftViewPermissions.has("registration.view.price");

  const canViewContact =
    shiftViewPermissions.has("registration.view.full") ||
    shiftViewPermissions.has("registration.view.contact");

  return prisma.registration.findMany({
    where: { shiftNr },
    select: {
      id: true,
      childId: true,
      shiftNr: true,
      isRegistered: true,
      regOrder: true,
      isOld: true,
      tsSize: true,
      // PII permission needed
      birthday: canViewPII,
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
    prisma,
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
