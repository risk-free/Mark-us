const base = require("../../packages/config/jest.preset.cjs");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testPathIgnorePatterns: ["\\.integration\\.test\\.ts$"],
};
