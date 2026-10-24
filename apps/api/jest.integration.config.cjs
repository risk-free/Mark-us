const base = require("../../packages/config/jest.preset.cjs");

/**
 * Integration config (mandate M7.2). ARCH-01 §13: search ranking + freshness
 * gates are verified against a real PostgreSQL 16 container (testcontainers) —
 * no mock database. `@markus/tm-data` maps to source, as in the unit config.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...base,
  testMatch: ["**/*.integration.test.ts"],
  testTimeout: 180_000,
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@markus/core$": "<rootDir>/../../packages/core/src/index.ts",
    "^@markus/tm-data$": "<rootDir>/../../packages/tm-data/src/index.ts",
  },
};