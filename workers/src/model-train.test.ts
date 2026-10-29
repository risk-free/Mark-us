import { DEFAULT_RELEASE_THRESHOLDS } from "@markus/tm-data";

import { parseModelTrainArgs, requireDatabaseUrl } from "./model-train.js";

const required = [
  "--model-version",
  "logistic-fixture-1",
  "--cutoff",
  "2020-01-01",
  "--census",
  "2022-01-01",
  "--output",
  "artifacts/logistic-fixture-1.json",
];

describe("parseModelTrainArgs (P5.4 offline trainer)", () => {
  test("parses required arguments with D-25/D-26 defaults", () => {
    expect(parseModelTrainArgs(required)).toEqual({
      modelVersion: "logistic-fixture-1",
      trainingCutoff: new Date("2020-01-01T00:00:00.000Z"),
      censusAt: new Date("2022-01-01T00:00:00.000Z"),
      output: "artifacts/logistic-fixture-1.json",
      horizonMonths: 12,
      releaseThresholds: DEFAULT_RELEASE_THRESHOLDS,
    });
  });

  test("accepts explicit horizon and release thresholds in any order", () => {
    const result = parseModelTrainArgs([
      "--min-auc",
      "0.75",
      ...required,
      "--horizon-months",
      "24",
      "--min-resolved-labels",
      "20",
      "--max-ci-half-width-pp",
      "25",
      "--min-lift-pp",
      "5",
    ]);

    expect(result.horizonMonths).toBe(24);
    expect(result.releaseThresholds).toEqual({
      minResolvedLabels: 20,
      maxCiHalfWidthPp: 25,
      minAuc: 0.75,
      minLiftPp: 5,
    });
  });

  test.each(["--model-version", "--cutoff", "--census", "--output"])(
    "requires %s",
    (flag) => {
      const args = required.filter((_, index) => {
        const requiredIndex = required.indexOf(flag);
        return index !== requiredIndex && index !== requiredIndex + 1;
      });
      expect(() => parseModelTrainArgs(args)).toThrow(new RegExp(`${flag} is required`));
    },
  );

  test("rejects malformed or impossible dates", () => {
    expect(() => parseModelTrainArgs(required.map((value) => value === "2020-01-01" ? "20200101" : value))).toThrow(/YYYY-MM-DD/);
    expect(() => parseModelTrainArgs(required.map((value) => value === "2020-01-01" ? "2020-02-30" : value))).toThrow(/valid calendar date/);
  });

  test("rejects invalid numeric options, missing values and unknown arguments", () => {
    expect(() => parseModelTrainArgs([...required, "--horizon-months", "0"])).toThrow(/must be positive/);
    expect(() => parseModelTrainArgs([...required, "--min-resolved-labels", "1.5"])).toThrow(/an integer/);
    expect(() => parseModelTrainArgs([...required, "--min-auc"])).toThrow(/requires a value/);
    expect(() => parseModelTrainArgs([...required, "--activate", "yes"])).toThrow(/unknown argument/);
  });

  test("rejects a cutoff that is not earlier than the census", () => {
    const args = required.map((value) => value === "2022-01-01" ? "2020-01-01" : value);
    expect(() => parseModelTrainArgs(args)).toThrow(/--cutoff must be earlier than --census/);
  });
});

describe("requireDatabaseUrl", () => {
  test("requires only a PostgreSQL database URL, not unrelated application secrets", () => {
    expect(requireDatabaseUrl({ DATABASE_URL: "postgresql://localhost:5432/markus" })).toBe(
      "postgresql://localhost:5432/markus",
    );
  });

  test("rejects a missing, malformed or non-PostgreSQL URL", () => {
    expect(() => requireDatabaseUrl({})).toThrow(/DATABASE_URL is required/);
    expect(() => requireDatabaseUrl({ DATABASE_URL: "not a url" })).toThrow(/valid PostgreSQL URL/);
    expect(() => requireDatabaseUrl({ DATABASE_URL: "redis://localhost:6379" })).toThrow(
      /postgres: or postgresql:/,
    );
  });
});
