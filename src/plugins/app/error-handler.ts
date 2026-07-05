import type { FastifyError, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { StatusCodes } from "http-status-codes";

import { createErrorResponse, createFailResponse } from "#app/lib/jsend";

const SERVER_ERROR_MIN: number = StatusCodes.INTERNAL_SERVER_ERROR;

const fieldFromValidationError = (
  instancePath: string,
  params: Record<string, unknown>,
): string => {
  if (instancePath) return instancePath.replace(/^\//, "").replace(/\//g, ".");
  if (typeof params.missingProperty === "string") return params.missingProperty;
  return "request";
};

// Normalises AJV validation failures to JSendFail.
const errorHandlerPlugin: FastifyPluginAsync = fp(async (server) => {
  server.setErrorHandler((error: FastifyError, req, res) => {
    if (error.validation) {
      const data: Record<string, string> = {};
      for (const issue of error.validation) {
        const field = fieldFromValidationError(
          issue.instancePath,
          issue.params,
        );
        data[field] = issue.message ?? "Väärtus pole lubatud.";
      }

      return res
        .status(error.statusCode ?? StatusCodes.BAD_REQUEST)
        .send(createFailResponse(data));
    }

    const statusCode: number =
      error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;

    if (statusCode < SERVER_ERROR_MIN) {
      return res
        .status(statusCode)
        .send(createErrorResponse(error.message || "Vigane päring."));
    }

    req.log.error({ err: error }, "Unhandled error");
    const message =
      server.config.NODE_ENV === "production"
        ? "Serveri viga."
        : error.message || "Ootamatu viga.";
    return res.status(statusCode).send(createErrorResponse(message));
  });

  server.setNotFoundHandler((_req, res) => {
    return res
      .status(StatusCodes.NOT_FOUND)
      .send(createFailResponse({ path: "Sellist teed pole olemas." }));
  });
});

export default errorHandlerPlugin;
