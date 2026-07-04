import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  createErrorResponse,
  createSuccessResponse,
  ErrorResponseRef,
  SuccessResponse,
} from "#app/lib/jsend";

import { AppPlatformQuery, AppVersionData } from "./app.schemas";
import { fetchAppVersion } from "./app.service";

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
    async (request, reply) => {
      const { key, version } = await fetchAppVersion(request.query.platform);

      if (version === null) {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createErrorResponse(`Versiooniinfo puudub: ${key}`));
      }

      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ version }));
    },
  );
};

export default plugin;
