import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { baseConfig } from "./packages/config/eslint/base.mjs";

const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
});

const webFiles = ["apps/web/**/*.{ts,tsx}"];

const nextLayer = compat
  .extends("next/core-web-vitals", "next/typescript")
  .filter((config) => !config.ignores)
  .map((config) => ({
    ...config,
    files: [...webFiles, ...(config.files ?? [])],
    rules: { ...config.rules, "@next/next/no-html-link-for-pages": "off" },
  }));

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  },
  ...baseConfig,
  ...nextLayer,
];
