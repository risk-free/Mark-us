/**
 * Shared ESLint flat-config base (ARCHITECTURE §2 — packages/config).
 *
 * Composed by the repository-root `eslint.config.mjs`, which adds the
 * Next.js layer for `apps/web`. Deliberately small: type-aware linting is
 * deferred (see docs/DESIGN-QUESTIONS.md, DQ-004) so `pnpm lint` stays fast.
 */

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export const baseConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      eqeqeq: ["error", "smart"],
      "no-console": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);

export default baseConfig;
