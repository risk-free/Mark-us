import { addMonths, assembleLabelSet, labelFor, temporalSplit, type OutcomeRow } from "./labels.js";

const row = (overrides: Partial<OutcomeRow> = {}): OutcomeRow => ({
  serialNumber: "1",
  filingDate: new Date("2020-01-15T00:00:00.000Z"),
  registrationDate: null,
  abandonDate: null,
  statusCode: "600",
  ...overrides,
});

describe("addMonths", () => {
  test("adds whole months", () => {
    expect(addMonths(new Date("2020-01-15T00:00:00.000Z"), 12).toISOString()).toBe("2021-01-15T00:00:00.000Z");
  });

  test("clamps to the last day of the target month", () => {
    expect(addMonths(new Date("2020-01-31T00:00:00.000Z"), 1).toISOString()).toBe("2020-02-29T00:00:00.000Z");
    expect(addMonths(new Date("2021-01-31T00:00:00.000Z"), 1).toISOString()).toBe("2021-02-28T00:00:00.000Z");
  });

  test("rolls over years", () => {
    expect(addMonths(new Date("2020-11-30T00:00:00.000Z"), 3).toISOString()).toBe("2021-02-28T00:00:00.000Z");
  });
});

describe("labelFor", () => {
  const census = new Date("2026-01-01T00:00:00.000Z");

  test("registered within the horizon is positive", () => {
    expect(labelFor(row({ registrationDate: new Date("2020-06-01T00:00:00.000Z") }), census, 12)).toBe("positive");
  });

  test("registered exactly on the horizon is positive", () => {
    expect(labelFor(row({ registrationDate: new Date("2021-01-15T00:00:00.000Z") }), census, 12)).toBe("positive");
  });

  test("registered after the horizon is censored", () => {
    expect(labelFor(row({ registrationDate: new Date("2021-02-01T00:00:00.000Z") }), census, 12)).toBe("censored");
  });

  test("abandoned within the horizon is negative", () => {
    expect(labelFor(row({ abandonDate: new Date("2020-09-01T00:00:00.000Z") }), census, 12)).toBe("negative");
  });

  test("a still-pending mark is censored, never negative", () => {
    expect(labelFor(row(), census, 12)).toBe("censored");
  });

  test("a future horizon is censored", () => {
    expect(labelFor(row({ filingDate: new Date("2025-06-01T00:00:00.000Z") }), census, 12)).toBe("censored");
  });
});

describe("assembleLabelSet", () => {
  const census = new Date("2026-01-01T00:00:00.000Z");

  test("partitions resolved and censored rows and computes baseRate", () => {
    const rows: OutcomeRow[] = [
      row({ serialNumber: "p1", registrationDate: new Date("2020-05-01T00:00:00.000Z") }),
      row({ serialNumber: "p2", registrationDate: new Date("2020-08-01T00:00:00.000Z") }),
      row({ serialNumber: "n1", abandonDate: new Date("2020-07-01T00:00:00.000Z") }),
      row({ serialNumber: "c1" }),
    ];
    const result = assembleLabelSet(rows, census, 12);
    expect(result.labeled).toHaveLength(3);
    expect(result.censored).toBe(1);
    expect(result.baseRate).toBeCloseTo(2 / 3, 10);
    expect(result.labeled.map((entry) => entry.label).sort()).toEqual(["negative", "positive", "positive"]);
  });

  test("empty input yields a zero base rate", () => {
    expect(assembleLabelSet([], census, 12)).toEqual({ labeled: [], censored: 0, baseRate: 0 });
  });
});

describe("temporalSplit", () => {
  test("a row exactly at the cutoff goes to the holdout", () => {
    const cutoff = new Date("2021-01-01T00:00:00.000Z");
    const rows = [
      { at: new Date("2020-12-31T00:00:00.000Z") },
      { at: new Date("2021-01-01T00:00:00.000Z") },
      { at: new Date("2021-06-01T00:00:00.000Z") },
    ];
    const { train, holdout } = temporalSplit(rows, cutoff, (r) => r.at);
    expect(train).toHaveLength(1);
    expect(holdout).toHaveLength(2);
  });
});
