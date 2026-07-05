import prisma from "#app/lib/prisma";
import { Permissions } from "#app/constants/permissions";
import type { RoleName } from "#app/constants/roles";

const BASE_SHIFT_PERMISSIONS = [
  Permissions.EDIT_SHIFT_BASIC,
  Permissions.VIEW_SHIFT_BASIC,
  Permissions.VIEW_REGISTRATION_BASIC,
  Permissions.VIEW_SHIFT_STAFF,
] as const;

const ROLE_PERMISSIONS: Record<RoleName, readonly Permissions[]> = {
  root: [
    ...BASE_SHIFT_PERMISSIONS,
    Permissions.VIEW_REGISTRATION_FULL,
    Permissions.EDIT_REGISTRATION_PRICE,
    Permissions.EDIT_REGISTRATION_IS_REGISTERED,
    Permissions.DELETE_REGISTRATION,
    Permissions.VIEW_SHIFT_PERMISSIONS,
  ],
  boss: [
    ...BASE_SHIFT_PERMISSIONS,
    Permissions.VIEW_REGISTRATION_PERSONAL_INFO,
    Permissions.VIEW_REGISTRATION_PRICE,
    Permissions.VIEW_REGISTRATION_CONTACT,
    Permissions.EDIT_REGISTRATION_PRICE,
    Permissions.EDIT_REGISTRATION_IS_REGISTERED,
    Permissions.DELETE_REGISTRATION,
    Permissions.VIEW_SHIFT_PERMISSIONS,
  ],
  instructor: [
    ...BASE_SHIFT_PERMISSIONS,
    Permissions.VIEW_REGISTRATION_CONTACT,
  ],
  helper: [...BASE_SHIFT_PERMISSIONS],
  "reg-viewer-basic": [Permissions.VIEW_REGISTRATION_BASIC],
};

const upsertRole = (roleName: RoleName) =>
  prisma.role.upsert({
    where: { roleName },
    update: {},
    create: { roleName },
  });

const upsertPermission = (permissionName: Permissions) =>
  prisma.permission.upsert({
    where: { permissionName },
    update: {},
    create: { permissionName },
  });

const main = async () => {
  const permissionIds = new Map<Permissions, number>();

  const getPermissionId = async (permissionName: Permissions) => {
    const cached = permissionIds.get(permissionName);
    if (cached !== undefined) return cached;

    const permission = await upsertPermission(permissionName);
    permissionIds.set(permissionName, permission.id);
    return permission.id;
  };

  for (const roleName of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
    const role = await upsertRole(roleName);

    for (const permissionName of ROLE_PERMISSIONS[roleName]) {
      const permissionId = await getPermissionId(permissionName);

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
