import { Permissions } from "#app/constants/permissions";
import type { RoleName } from "#app/constants/roles";
import type { PrismaClient } from "#app/generated/prisma/client";

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
    Permissions.EDIT_SHIFT_MEMBERS,
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
    Permissions.EDIT_SHIFT_MEMBERS,
  ],
  instructor: [
    ...BASE_SHIFT_PERMISSIONS,
    Permissions.VIEW_REGISTRATION_CONTACT,
  ],
  helper: [...BASE_SHIFT_PERMISSIONS],
  "reg-viewer-basic": [Permissions.VIEW_REGISTRATION_BASIC],
};

export const seedRolesAndPermissions = async (
  client: PrismaClient,
): Promise<void> => {
  const permissionIds = new Map<Permissions, number>();

  const getPermissionId = async (permissionName: Permissions) => {
    const cached = permissionIds.get(permissionName);
    if (cached !== undefined) return cached;

    const permission = await client.permission.upsert({
      where: { permissionName },
      update: {},
      create: { permissionName },
    });
    permissionIds.set(permissionName, permission.id);
    return permission.id;
  };

  for (const roleName of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
    const role = await client.role.upsert({
      where: { roleName },
      update: {},
      create: { roleName },
    });

    for (const permissionName of ROLE_PERMISSIONS[roleName]) {
      const permissionId = await getPermissionId(permissionName);

      await client.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }
};
