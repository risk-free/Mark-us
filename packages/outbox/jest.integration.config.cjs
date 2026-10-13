const base = require("../../packages/config/jest.preset.cjs");

/**
 * Integration config (mandate M3.4 fault-injection).
 *
 * Kept separate from the unit config so the default `pnpm test` stays fast and
 * Docker-free. ARCH-01 §13: outbox behaviour is verified against a real
 * PostgreSQL 16 container (testcontainers) — no mock database.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...base,
  testMatch: ["**/*.integration.test.ts"],
  testTimeout: 180_000,
};
