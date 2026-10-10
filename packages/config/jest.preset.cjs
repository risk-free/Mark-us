/**
 * Shared Jest preset (ARCHITECTURE §2 — packages/config).
 *
 * Adopt in a package with:
 *   jest.config.cjs  ->  module.exports = { preset: "@markus/config/jest.preset.cjs" };
 * The package must have its own `jest` + `ts-jest` devDependencies.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: { module: "CommonJS", moduleResolution: "Node" } },
    ],
  },
};
