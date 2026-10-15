const base = require("../../packages/config/jest.preset.cjs");

/**
 * `@markus/kb` and `@markus/llm-gateway` ship as ESM in `dist/`; map both to
 * TypeScript source so ts-jest compiles them to CJS alongside the eval tests
 * (same pattern as the KB package).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...base,
  testPathIgnorePatterns: ["\\.integration\\.test\\.ts$"],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@markus/kb$": "<rootDir>/../../packages/kb/src/index.ts",
    "^@markus/llm-gateway$": "<rootDir>/../../packages/llm-gateway/src/index.ts",
  },
};
