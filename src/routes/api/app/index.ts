import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { fetchAppVersionHandler } from "../../../controllers/app.controller";
import { AppPlatformQuery, AppVersionData } from "../../../schemas/app";
import { ErrorResponse, SuccessResponse } from "../../../schemas/jsend";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/version",
    {
      config: { public: true },
      schema: {
        querystring: AppPlatformQuery,
        response: {
          [StatusCodes.OK]: SuccessResponse(AppVersionData),
          [StatusCodes.NOT_FOUND]: ErrorResponse,
        },
      },
    },
    fetchAppVersionHandler,
  );
};

export default plugin;
