import type { Registration } from "#app/generated/prisma/client";

import prisma from "#app/lib/prisma";
import { getAgeAtDate } from "#app/lib/age";
import {
  deriveRegistrationViewFlags,
  fetchUserShiftPermissions,
} from "#app/lib/permissions";
import { PermissionPrefixes, Permissions } from "#app/constants/permissions";
import { toggleRecord } from "#app/services/camp-records.service";

import type {
  FilteredRegistrationSchema,
  PatchRegistrationBody,
} from "./registrations.schemas";

const objectHasAllowedKey = <
  FullModel extends object,
  Patch extends Partial<FullModel>,
>(
  obj: Patch,
  allowedKeys: readonly (keyof FullModel)[],
): boolean => {
  return allowedKeys.some((key) => Object.hasOwn(obj, key));
};

export type FetchRegistrationsResult =
  | { status: "no-shift" }
  | { status: "ok"; registrations: FilteredRegistrationSchema[] };

export const fetchRegistrations = async (
  userId: number,
  shiftNr: number,
): Promise<FetchRegistrationsResult> => {
  if (!shiftNr) {
    return { status: "no-shift" };
  }

  // Fetch the user's registration view permissions for the given shift.
  const shiftViewPermissions = await fetchUserShiftPermissions(
    userId,
    shiftNr,
    PermissionPrefixes.REGISTRATION_VIEW,
  );
  if (shiftViewPermissions.size === 0) {
    return { status: "ok", registrations: [] };
  }

  const {
    pii: canViewPII,
    financial: canViewFinancial,
    contact: canViewContact,
  } = deriveRegistrationViewFlags(shiftViewPermissions);

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

  return { status: "ok", registrations };
};

export const patchRegistrationData = async (
  userId: number,
  regId: number,
  patchData: PatchRegistrationBody,
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

  const isRegisteredKey = "isRegistered" satisfies keyof Registration;

  await prisma.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: regId },
      data: patchData,
    });

    // If the child is registered, the camp record must be updated accordingly.
    // Likewise, if the child was de-registered.
    if (
      Object.hasOwn(patchData, isRegisteredKey) &&
      typeof patchData[isRegisteredKey] === "boolean"
    ) {
      await toggleRecord(
        {
          childId: regShift.childId,
          shiftNr: regShift.shiftNr,
        },
        patchData[isRegisteredKey],
        tx,
      );
    }
  });

  return true;
};

export const syncCampers = async (): Promise<void> => {
  const registrations = await prisma.registration.findMany();

  const updates = registrations
    .filter((registration) => registration.idCode !== null)
    .map((registration) =>
      prisma.child.update({
        where: { id: registration.childId },
        data: {
          idCode: registration.idCode,
          birthYear: registration.birthday.getUTCFullYear(),
        },
      }),
    );

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
};
