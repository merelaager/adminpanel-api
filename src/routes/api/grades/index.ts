import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { GradeDeleteSchema } from "#app/schemas/grades";
import { deleteGradeHandler } from "#app/controllers/grades.controller";

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
