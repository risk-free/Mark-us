const base = require("../../packages/config/jest.preset.cjs");

/**
 * Unit config. Root contract tests import `@markus/tm-data`, which ships as ESM
 * in `dist/` — map the package to its TypeScript source so ts-jest can compile
 * it to CJS alongside the app's tests (same pattern as `@markus/workers`).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...base,
  testPathIgnorePatterns: ["\\.integration\\.test\\.ts$"],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@markus/tm-data$": "<rootDir>/../../packages/tm-data/src/index.ts",
  },
};