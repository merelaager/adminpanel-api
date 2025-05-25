import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { authenticateUser } from "../../../controllers/auth.controller";

import { CredentialsSchema } from "../../../schemas/auth";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/login",
    {
      schema: {
        body: CredentialsSchema,
        response: {
          [StatusCodes.OK]: {
            status: "success",
            data: {},
          },
          [StatusCodes.UNAUTHORIZED]: {
            status: "fail",
            data: {
              message: Type.String(),
            },
          },
        },
      },
    },
    async (request) => {
      const { username, password } = request.body;
      const user = await authenticateUser(
        { username, password },
        fastify.prisma,
      );

      if (user) {
        request.session.user = { id: user.id };
        await request.session.save();
        return { status: "success", data: {} };
      }

      return {
        status: "fail",
        data: { message: "Vale kasutajanimi või parool" },
      };
    },
  );
};

export default plugin;
