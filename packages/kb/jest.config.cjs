const base = require("../../packages/config/jest.preset.cjs");

/**
 * `@markus/llm-gateway` ships as ESM in `dist/`; map it to TypeScript source so
 * ts-jest can compile it to CJS alongside the KB tests (same pattern as the API
 * and workers packages).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...base,
  testPathIgnorePatterns: ["\\.integration\\.test\\.ts$"],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@markus/llm-gateway$": "<rootDir>/../../packages/llm-gateway/src/index.ts",
  },
};
