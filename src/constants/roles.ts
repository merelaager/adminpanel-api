export const ROLE_NAMES = [
  "root",
  "boss",
  "instructor",
  "helper",
  "reg-viewer-basic",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
