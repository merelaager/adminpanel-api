export const ROLE_NAMES = [
  "root",
  "boss",
  "instructor",
  "helper",
  "reg-viewer-basic",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const SHIFT_BOSS_ROLES = [
  "root",
  "boss",
] as const satisfies readonly RoleName[];

// Anyone holding one of these roles counts as shift staff.
export const SHIFT_STAFF_ROLES = [
  "root",
  "boss",
  "instructor",
  "helper",
] as const satisfies readonly RoleName[];

// Role names as stored on Role/UserRoles are plain DB strings, not a TS
// enum, so membership checks need to compare against `string`, not `RoleName`.
export const isRoleNameIn = (
  roleName: string,
  roles: readonly RoleName[],
): boolean => (roles as readonly string[]).includes(roleName);
