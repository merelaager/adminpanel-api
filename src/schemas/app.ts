import { Static, Type } from "@sinclair/typebox";

export const AppPlatformQuery = Type.Object({
  platform: Type.Union([Type.Literal("android"), Type.Literal("ios")]),
});

export type AppPlatformQueryParams = Static<typeof AppPlatformQuery>;

export const AppVersionData = Type.Object({
  version: Type.String(),
});
