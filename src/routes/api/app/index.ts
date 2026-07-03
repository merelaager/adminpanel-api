import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { fetchAppVersionHandler } from "#app/controllers/app.controller";
import { AppPlatformQuery, AppVersionData } from "#app/schemas/app";
import { ErrorResponseRef, SuccessResponse } from "#app/schemas/jsend";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/version",
    {
      config: { public: true },
      schema: {
        querystring: AppPlatformQuery,
        response: {
          [StatusCodes.OK]: SuccessResponse(AppVersionData),
          [StatusCodes.NOT_FOUND]: ErrorResponseRef,
        },
      },
    },
    fetchAppVersionHandler,
  );
};

export default plugin;
