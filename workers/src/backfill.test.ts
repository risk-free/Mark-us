import { parseBackfillArgs } from "./backfill.js";

describe("parseBackfillArgs (P5.2 backfill CLI)", () => {
  test("parses an inclusive year range", () => {
    expect(parseBackfillArgs(["--years", "2004-2006"])).toEqual({
      years: [2004, 2005, 2006],
    });
  });

  test("parses a comma-separated year list, trimming whitespace", () => {
    expect(parseBackfillArgs(["--years", "2004, 2006"])).toEqual({ years: [2004, 2006] });
  });

  test("passes an optional table through", () => {
    expect(parseBackfillArgs(["--years", "2004", "--table", "assignment"])).toEqual({
      years: [2004],
      table: "assignment",
    });
  });

  test("flags may appear in any order", () => {
    expect(parseBackfillArgs(["--table", "case_file", "--years", "2004-2005"])).toEqual({
      years: [2004, 2005],
      table: "case_file",
    });
  });

  test("--years is required", () => {
    expect(() => parseBackfillArgs([])).toThrow(/--years is required/);
    expect(() => parseBackfillArgs(["--table", "case_file"])).toThrow(/--years is required/);
  });

  test("rejects out-of-range and malformed years", () => {
    expect(() => parseBackfillArgs(["--years", "1899"])).toThrow(/invalid year/);
    expect(() => parseBackfillArgs(["--years", "2101"])).toThrow(/invalid year/);
    expect(() => parseBackfillArgs(["--years", "abcd"])).toThrow(/invalid year/);
    expect(() => parseBackfillArgs(["--years", "2004.5"])).toThrow(/invalid year/);
  });

  test("rejects a reversed range", () => {
    expect(() => parseBackfillArgs(["--years", "2023-2004"])).toThrow(/from > to/);
  });

  test("rejects missing flag values and unknown arguments", () => {
    expect(() => parseBackfillArgs(["--years"])).toThrow(/--years requires a value/);
    expect(() => parseBackfillArgs(["--table"])).toThrow(/--table requires a value/);
    expect(() => parseBackfillArgs(["--source", "tdxf"])).toThrow(/unknown argument/);
  });
});
