const base = require("@markus/config/jest.preset.cjs");

/**
 * Unit config for the P1 marketing website (apps/web).
 *
 * Mirrors the shared preset (@markus/config/jest.preset.cjs) and adds this
 * package's path aliases:
 *   ^@/(.*)$          -> <rootDir>/src/$1
 *   ^@markus/tm-data$ -> <rootDir>/../../packages/tm-data/src/index.ts
 *   (the same ESM-source mapping kb/eval already use).
 *
 * testMatch also covers scripts/ so scripts/lib/claims.test.mjs is exercised.
 * ts-jest compiles JSX as react-jsx (the app tsconfig keeps jsx: preserve for
 * Next, but Jest needs a compilable JSX pragma).
 */
module.exports = {
  ...base,
  roots: ["<rootDir>/src", "<rootDir>/scripts"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.mjs"],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@markus/tm-data$": "<rootDir>/../../packages/tm-data/src/index.ts",
  },
  transform: {
    ...base.transform,
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "Node",
          jsx: "react-jsx",
          resolveJsonModule: true,
          esModuleInterop: true,
        },
      },
    ],
  },
};
