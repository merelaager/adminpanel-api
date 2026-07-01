import type {
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from "fastify";
import { StatusCodes } from "http-status-codes";

import prisma from "../utils/prisma";
import { createErrorResponse, createSuccessResponse } from "../utils/jsend";

import type { JSendError, JSendResponse } from "../schemas/jsend";
import { AppPlatformQueryParams, AppVersionData } from "../schemas/app";

const GENERAL_INFO_KEY_BY_PLATFORM = {
  android: "androidVersion",
  ios: "iosVersion",
} as const;

interface IFetchAppVersionHandler extends RouteGenericInterface {
  Querystring: AppPlatformQueryParams;
  Reply: JSendResponse<typeof AppVersionData> | JSendError;
}

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
