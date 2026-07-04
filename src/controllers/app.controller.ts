import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "#app/lib/prisma";
import { createErrorResponse, createSuccessResponse } from "#app/lib/jsend";

import type { JSendError, JSendResponse } from "#app/lib/jsend";
import { AppPlatformQuery, AppVersionData } from "#app/schemas/app";
import type { Route } from "#app/schemas/route";

const GENERAL_INFO_KEY_BY_PLATFORM = {
  android: "androidVersion",
  ios: "iosVersion",
} as const;

type IFetchAppVersionHandler = Route<{
  querystring: typeof AppPlatformQuery;
}> & {
  Reply: JSendResponse<typeof AppVersionData> | JSendError;
};

export const fetchAppVersionHandler = async (
  req: FastifyRequest<IFetchAppVersionHandler>,
  res: FastifyReply<IFetchAppVersionHandler>,
): Promise<never> => {
  const { platform } = req.query;
  const key = GENERAL_INFO_KEY_BY_PLATFORM[platform];

  const info = await prisma.generalInfo.findUnique({ where: { key } });

  if (!info) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .send(createErrorResponse(`Versiooniinfo puudub: ${key}`));
  }

  return res
    .status(StatusCodes.OK)
    .send(createSuccessResponse({ version: info.value }));
};
