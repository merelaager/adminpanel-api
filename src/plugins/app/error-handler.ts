import type { FastifyError, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { StatusCodes } from "http-status-codes";

import { createFailResponse } from "#app/lib/jsend";

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

    req.log.error({ err: error }, "Unhandled error");
    return res
      .status(error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR)
      .send({
        status: "error",
        message: error.message || "Ootamatu viga.",
      });
  });
});

export default errorHandlerPlugin;
