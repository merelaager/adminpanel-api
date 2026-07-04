import prisma from "#app/lib/prisma";

const GENERAL_INFO_KEY_BY_PLATFORM = {
  android: "androidVersion",
  ios: "iosVersion",
} as const;

type AppPlatform = keyof typeof GENERAL_INFO_KEY_BY_PLATFORM;

export const fetchAppVersion = async (platform: AppPlatform) => {
  const key = GENERAL_INFO_KEY_BY_PLATFORM[platform];
  const info = await prisma.generalInfo.findUnique({ where: { key } });
  return { key, version: info?.value ?? null };
};
