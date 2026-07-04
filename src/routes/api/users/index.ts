import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { StatusCodes } from "http-status-codes";

import { requireShiftPermission } from "#app/lib/guards";
import { Permissions } from "#app/constants/permissions";
import { getSessionUser } from "#app/lib/session";
import {
  createErrorResponse,
  createFailResponse,
  ErrorResponseRef,
  FailResponse,
} from "#app/lib/jsend";

import {
  CreateInviteSchema,
  PatchUserSchema,
  UserParamsSchema,
} from "./users.schemas";
import { inviteUser, patchUser } from "./users.service";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.patch(
    "/:userId",
    {
      schema: {
        params: UserParamsSchema,
        body: PatchUserSchema,
        response: {
          [StatusCodes.NO_CONTENT]: {},
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Partial(
              Type.Object({
                userId: Type.String(),
                currentShift: Type.String(),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const requesterId = getSessionUser(request).userId;

      if (userId !== requesterId) {
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            userId: "Muuta saab ainult enda kasutajat.",
          }),
        );
      }

      const result = await patchUser(requesterId, request.body);

      if (result === "not-shift-member") {
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            currentShift: `Kasutaja pole vahetuse liige. (shiftNr: ${request.body.currentShift})`,
          }),
        );
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );

  fastify.post(
    "/invites",
    {
      preHandler: requireShiftPermission(
        Permissions.EDIT_SHIFT_MEMBERS,
        "body",
        "Puuduvad õigused kasutaja loomiseks!",
      ),
      schema: {
        body: CreateInviteSchema,
        response: {
          [StatusCodes.NO_CONTENT]: {},
          [StatusCodes.UNPROCESSABLE_ENTITY]: FailResponse(
            Type.Object({
              role: Type.String(),
            }),
          ),
          [StatusCodes.FORBIDDEN]: FailResponse(
            Type.Object({
              permissions: Type.String(),
            }),
          ),
          [StatusCodes.INTERNAL_SERVER_ERROR]: ErrorResponseRef,
        },
      },
    },
    async (request, reply) => {
      const result = await inviteUser(
        request.body,
        request.server.mailer,
        request.server.config.APP_URL,
        request.log,
      );

      if (result === "invalid-role") {
        return reply.status(StatusCodes.UNPROCESSABLE_ENTITY).send(
          createFailResponse({
            role: `Roll '${request.body.role}' ei ole valikus.`,
          }),
        );
      }

      if (result === "mail-failed") {
        return reply
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send(
            createErrorResponse("Ootamatu viga regamispääsmiku saatmisel."),
          );
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
