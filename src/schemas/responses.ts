import { Type } from "@sinclair/typebox";

export const RequestPermissionsFail = Type.Object({
  permissions: Type.String(),
});
