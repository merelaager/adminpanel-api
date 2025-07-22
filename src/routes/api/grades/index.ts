import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { GradeDeleteSchema } from "../../../schemas/grades";
import { deleteGradeHandler } from "../../../controllers/grades.controller";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.delete(
    "/:gradeId",
    {
      schema: {
        params: GradeDeleteSchema,
      },
    },
    deleteGradeHandler,
  );
};

export default plugin;
