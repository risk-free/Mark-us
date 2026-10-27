const base = require("../packages/config/jest.preset.cjs");

/**
 * Integration config (P5.2). ARCH-01 §13: the backfill runner is verified
 * against a real PostgreSQL 16 container (testcontainers) — no mock database.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...base,
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@markus/config$": "<rootDir>/../packages/config/src/index.ts",
    "^@markus/tm-data$": "<rootDir>/../packages/tm-data/src/index.ts",
  },
  testMatch: ["**/*.integration.test.ts"],
  testTimeout: 180_000,
};
