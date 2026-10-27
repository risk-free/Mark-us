const base = require("../packages/config/jest.preset.cjs");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  // `@markus/tm-data` and `@markus/config` ship ESM; run them from source so
  // ts-jest emits CommonJS (the backfill CLI imports `loadEnv` at runtime).
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@markus/config$": "<rootDir>/../packages/config/src/index.ts",
    "^@markus/tm-data$": "<rootDir>/../packages/tm-data/src/index.ts",
  },
  testPathIgnorePatterns: ["\\.integration\\.test\\.ts$"],
};
