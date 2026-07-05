import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "src/generated/**",
      "scripts/**",
      "eslint.config.mjs",
      "ecosystem.config.js",
      "prisma.config.ts",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Needed for Fastify.
    // https://github.com/fastify/fastify/pull/6514
    files: ["src/plugins/**/*.ts", "src/routes/**/*.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
);
