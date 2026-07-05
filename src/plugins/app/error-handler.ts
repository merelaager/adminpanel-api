import type { FastifyError, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { StatusCodes } from "http-status-codes";

import { createErrorResponse, createFailResponse } from "#app/lib/jsend";

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
        data[field] = issue.message ?? "Väärtus ei ole lubatud.";
      }

      return res
        .status(error.statusCode ?? StatusCodes.BAD_REQUEST)
        .send(createFailResponse(data));
    }

    const statusCode = error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;

    // Intentional client errors (4xx, e.g. rate limiting) carry a curated, safe
    // message — surface it directly with its status. Only unexpected server
    // errors (5xx) are logged and masked to avoid leaking internals.
    if (statusCode < StatusCodes.INTERNAL_SERVER_ERROR) {
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

  server.setNotFoundHandler((req, res) => {
    return res
      .status(StatusCodes.NOT_FOUND)
      .send(createFailResponse({ path: "Sellist teed pole olemas." }));
  });
});

export default errorHandlerPlugin;
