import { Type } from "@sinclair/typebox";

export const AppPlatformQuery = Type.Object({
  platform: Type.Union([Type.Literal("android"), Type.Literal("ios")]),
});

export const AppVersionData = Type.Object({
  version: Type.String(),
});
