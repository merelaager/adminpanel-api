import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { resetPasswordHandler } from "../../../controllers/users.controller";
import { ResetPasswordSchema } from "../../../schemas/user";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.put(
    "/password",
    {
      config: {
        public: true,
        rateLimit: {
          max: 1,
          timeWindow: "1 hour",
        },
      },
      schema: {
        body: ResetPasswordSchema,
      },
    },
    resetPasswordHandler,
  );
};

export default plugin;
