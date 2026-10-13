import { isLiveStatus, isWordMark, parseIsoDate, parseResearcherRecord } from "./researcher.js";

const base = (overrides: Record<string, string> = {}): Record<string, string> => ({
  serial_no: "97123456",
  mark_id_char: "ACME",
  cfh_status_cd: "700",
  cfh_status_dt: "2024-01-02",
  filing_dt: "2021-03-04",
  registration_dt: "2022-06-07",
  registration_no: "6789012",
  abandon_dt: "",
  mark_draw_cd: "4000",
  std_char_claim_in: "Y",
  tad_file_id: "42",
  ...overrides,
});

describe("isLiveStatus", () => {
  test("live is first digit 6 or 7", () => {
    expect(isLiveStatus("600")).toBe(true);
    expect(isLiveStatus("700")).toBe(true);
    expect(isLiveStatus("800")).toBe(false);
    expect(isLiveStatus("")).toBe(false);
  });
});

describe("isWordMark", () => {
  test("requires text plus a word draw code or a standard-character claim", () => {
    expect(isWordMark(base())).toBe(true);
    expect(isWordMark(base({ mark_draw_cd: "3000", std_char_claim_in: "" }))).toBe(true);
    expect(isWordMark(base({ mark_draw_cd: "2000", std_char_claim_in: "" }))).toBe(false);
    expect(isWordMark(base({ mark_id_char: "" }))).toBe(false);
  });
});

describe("parseIsoDate", () => {
  test("parses valid, treats empty as null, rejects malformed", () => {
    expect(parseIsoDate("2024-01-02")).toEqual({ ok: true, date: new Date("2024-01-02T00:00:00.000Z") });
    expect(parseIsoDate("")).toEqual({ ok: true, date: null });
    expect(parseIsoDate("02/01/2024")).toEqual({ ok: false });
    expect(parseIsoDate("2024-13-40")).toEqual({ ok: false });
  });
});

describe("parseResearcherRecord", () => {
  test("maps a LIVE word mark to a corpus record", () => {
    const outcome = parseResearcherRecord(base(), "TRCFECO2/2024/case_file.csv");
    expect(outcome.kind).toBe("record");
    if (outcome.kind !== "record") return;
    expect(outcome.record).toMatchObject({
      serialNumber: "97123456",
      markText: "ACME",
      normalizedText: "acme",
      statusCode: "700",
      registrationNumber: "6789012",
      sourceFile: "TRCFECO2/2024/case_file.csv",
      classes: [],
      goodsSummary: null,
    });
    expect(outcome.record.filingDate).toEqual(new Date("2021-03-04T00:00:00.000Z"));
    expect(outcome.record.abandonDate).toBeNull();
  });

  test("skips non-word marks without treating them as errors", () => {
    expect(parseResearcherRecord(base({ mark_draw_cd: "2000", std_char_claim_in: "" }), "f")).toEqual({
      kind: "skip",
      reason: "not-a-word-mark",
    });
  });

  test("skips non-LIVE status", () => {
    expect(parseResearcherRecord(base({ cfh_status_cd: "800" }), "f")).toEqual({
      kind: "skip",
      reason: "not-live",
    });
  });

  test("rejects a row with no serial number (quarantine)", () => {
    expect(parseResearcherRecord(base({ serial_no: "" }), "f")).toMatchObject({
      kind: "reject",
      reason: "missing-serial-number",
    });
  });

  test("rejects a malformed filing date", () => {
    expect(parseResearcherRecord(base({ filing_dt: "not-a-date" }), "f")).toMatchObject({
      kind: "reject",
      reason: "invalid-filing-date",
    });
  });
});
