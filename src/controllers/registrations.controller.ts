import { PrismaClient } from "@prisma/client";

export const fetchShiftRegistrations = async (
  userId: number,
  shiftNr: number,
  prisma: PrismaClient,
) => {
  // Fetch the user's registration view permissions for the given shift.
  const userShiftRolesRaw = await prisma.userRoles.findMany({
    where: { userId, shiftNr },
    select: {
      roles: {
        select: {
          role_permissions: {
            where: {
              permissions: {
                permissionName: { startsWith: "registration.view" },
              },
            },
            select: { permissions: { select: { permissionName: true } } },
          },
        },
      },
    },
  });

  const shiftViewPermissions = new Set<string>();
  for (const role of userShiftRolesRaw) {
    for (const permission of role.roles.role_permissions) {
      shiftViewPermissions.add(permission.permissions.permissionName);
    }
  }

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

export const fetchAuthorisedRegistrations = async (
  userId: number,
  prisma: PrismaClient,
) => {
  // Fetch the user's registration view permissions for all shifts.
  const userShiftRoles = await prisma.userRoles.findMany({
    where: { userId },
    select: {
      shiftNr: true,
      roles: {
        select: {
          role_permissions: {
            where: {
              permissions: {
                permissionName: {
                  startsWith: "registration.view.",
                },
              },
            },
            select: {
              permissions: {
                select: {
                  permissionName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const shiftViewPermissionsMap = new Map<number, Set<string>>();

  // TODO: ensure that only the most powerful permission is accounted for.
  // This should not (yet) be a problem in practice since users (currently)
  // only get one role per shift.
  for (const { shiftNr, roles } of userShiftRoles) {
    if (roles === null) continue;
    for (const rp of roles.role_permissions) {
      const perm = rp.permissions.permissionName;

      if (!shiftViewPermissionsMap.has(shiftNr)) {
        shiftViewPermissionsMap.set(shiftNr, new Set<string>());
      }

      shiftViewPermissionsMap.get(shiftNr)?.add(perm);
    }
  }

  const shiftViewPermissions = Array.from(
    shiftViewPermissionsMap.entries(),
  ).map(([shiftNr, permsSet]) => ({
    shiftNr,
    permissions: Array.from(permsSet),
  }));

  const shiftsWithViewPermissions = Array.from(shiftViewPermissionsMap.keys());

  // Perform multiple DB queries to avoid parsing fields in software.
  for (const shiftNr of shiftsWithViewPermissions) {
    const shiftViewPermission = shiftViewPermissions.find(
      (el) => el.shiftNr === shiftNr,
    );

    const registrations = await prisma.registration.findMany({
      where: { shiftNr },
    });
  }

  const registrations = await prisma.registration.findMany({
    where: {
      shiftNr: { in: shiftsWithViewPermissions },
    },
  });

  const filteredRegistrations = [];
  for (const registration of registrations) {
    const filteredRegistration: BaseRegDisplayFields = {
      id: registration.id,
      childId: registration.childId,
      shiftNr: registration.shiftNr,
      isRegistered: registration.isRegistered,
      regOrder: registration.regOrder,
      isOld: registration.isOld,
      tsSize: registration.tsSize,
    };
  }

  return registrations;
};

type BaseRegDisplayFields = {
  id: number;
  childId: number;
  shiftNr: number;
  isRegistered: boolean;
  regOrder: number;
  isOld: boolean;
  tsSize: string;
};

type PersonalInfoDisplayFields = {
  birthday: Date;
  road: string;
  county: string;
  country: string;
};

type ContactInfoDisplayFields = {
  contactName: string;
  contactNumber: string;
  contactEmail: string;
  backupTel: string;
};

type PriceInfoDisplayFields = {
  pricePaid: number;
  priceToPay: number;
  notifSent: boolean;
  billId: number;
};
