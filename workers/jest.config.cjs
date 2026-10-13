const base = require("../packages/config/jest.preset.cjs");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  // `@markus/tm-data` ships ESM; run it from source so ts-jest emits CommonJS.
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@markus/tm-data$": "<rootDir>/../packages/tm-data/src/index.ts",
  },
  testPathIgnorePatterns: ["\\.integration\\.test\\.ts$"],
};
