import "../helpers/test-env";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

import { Permissions } from "#app/constants/permissions";

import { seedRolesAndPermissions } from "../../prisma/seed-core";
import { resetDb, prisma } from "../helpers/db";

const roleHasPermission = async (roleName: string, permission: Permissions) =>
  (await prisma.rolePermission.count({
    where: { role: { roleName }, permission: { permissionName: permission } },
  })) > 0;

before(async () => {
  await resetDb();
});

after(async () => {
  await prisma.$disconnect();
});

void test("seeding removes permissions a role does not list", async () => {
  const boss = await prisma.role.findUniqueOrThrow({
    where: { roleName: "boss" },
  });
  const fullView = await prisma.permission.findUniqueOrThrow({
    where: { permissionName: Permissions.VIEW_REGISTRATION_FULL },
  });
  await prisma.rolePermission.create({
    data: { roleId: boss.id, permissionId: fullView.id },
  });

  await seedRolesAndPermissions(prisma);

  assert.equal(
    await roleHasPermission("boss", Permissions.VIEW_REGISTRATION_FULL),
    false,
  );
  assert.equal(
    await roleHasPermission("root", Permissions.VIEW_REGISTRATION_FULL),
    true,
  );
});
