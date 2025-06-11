import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import {
  authenticateUser,
  userInfoHandler,
} from "../../../controllers/auth.controller";

import { CredentialsSchema } from "../../../schemas/auth";
import { UserInfoSchema } from "../../../schemas/user";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/me",
    {
      schema: {
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: UserInfoSchema,
          }),
        },
      },
    },
    userInfoHandler,
  );
  fastify.post(
    "/login",
    {
      schema: {
        body: CredentialsSchema,
        response: {
          [StatusCodes.OK]: Type.Object({
            status: Type.Literal("success"),
            data: UserInfoSchema,
          }),
          [StatusCodes.UNAUTHORIZED]: Type.Object({
            status: Type.Literal("fail"),
            data: Type.Object({ message: Type.String() }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const user = await authenticateUser(
        { username, password },
        fastify.prisma,
      );

      if (user) {
        request.session.user = { userId: user.id };
        await request.session.save();
        return reply.code(StatusCodes.OK).send({
          status: "success",
          data: {
            userId: user.id,
            name: user.name,
            nickname: user.nickname ?? "",
            email: user.email ?? "",
            currentShift: user.currentShift,
            isRoot: user.role === "root",
          },
        });
      }

      return reply.code(StatusCodes.UNAUTHORIZED).send({
        status: "fail",
        data: { message: "Vale kasutajanimi või parool." },
      });
    },
  );
  fastify.post(
    "/logout",
    {
      schema: {
        response: {
          [StatusCodes.NO_CONTENT]: {},
        },
      },
    },
    async (request, reply) => {
      await request.session.destroy();
      reply.clearCookie("sessionId");
      return reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default plugin;
