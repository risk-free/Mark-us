const base = require("../../packages/config/jest.preset.cjs");

/**
 * Integration config (mandate M7.1). ARCH-01 §13: ingest behaviour is verified
 * against a real PostgreSQL 16 container (testcontainers) — no mock database.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...base,
  testMatch: ["**/*.integration.test.ts"],
  testTimeout: 180_000,
};
