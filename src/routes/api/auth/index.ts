import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import bcrypt from "bcrypt";
import { StatusCodes } from "http-status-codes";

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
    async (request, reply) => {
      const { username, password } = request.body;

      const user = await fastify.prisma.user.findUnique({
        where: {
          username: username.trim().toLowerCase(),
        },
      });

      if (user) {
        const isPasswordValid = bcrypt.compareSync(password, user.password);
        if (isPasswordValid) {
          request.session.user = { id: user.id };
          await request.session.save();
          return { status: "success", data: {} };
        }
      }

      return {
        status: "fail",
        data: { message: "Vale kasutajanimi või parool" },
      };
    },
  );
};

export default plugin;
