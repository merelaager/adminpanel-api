export const ROLE_NAMES = [
  "root",
  "boss",
  "instructor",
  "helper",
  "reg-viewer-basic",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const RoleNameMap = {
  root: "Juurkasutaja",
  boss: "Juhataja",
  instructor: "Kasvataja",
  helper: "Abikasvataja",
  "reg-viewer-basic": "Sirvija",
} satisfies Record<RoleName, string>;

// Role.roleName comes back from the DB as a plain string, so lookups need to
// tolerate values outside the known RoleName union.
export const getRoleDisplayName = (roleName: string): string =>
  (RoleNameMap as Record<string, string>)[roleName] ?? roleName;
