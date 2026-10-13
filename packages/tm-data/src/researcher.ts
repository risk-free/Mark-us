/**
 * Researcher case-file row mapping (D-02 backfill path).
 *
 * The USPTO "Trademark Case Files Dataset" (product `TRCFECO2`) is a
 * flat `case_file.csv` with one row per serial number. Column names come from the
 * measured export (`D-24`/ARCH-05): `serial_no`, `mark_id_char` (literal word
 * mark), `mark_draw_cd` / `std_char_claim_in` (word-mark signal), `cfh_status_cd`
 * (status), `filing_dt` / `registration_dt` / `abandon_dt`, `registration_no`,
 * `tad_file_id`. It carries no goods summary and no class list, so those are
 * `null` / `[]` on this path — the nightly ODP TDXF XML supplies them.
 */

import { normalizeMarkText } from "./normalize.js";
import type { CorpusMarkInput, ParseOutcome } from "./types.js";

/** Mark drawing codes that denote a word mark (ARCH-05 §2). */
export const WORD_DRAW_CODES = ["3000", "4000"] as const;

export const RESEARCHER_COLUMNS = {
  serialNumber: "serial_no",
  markText: "mark_id_char",
  statusCode: "cfh_status_cd",
  statusDate: "cfh_status_dt",
  filingDate: "filing_dt",
  registrationDate: "registration_dt",
  registrationNumber: "registration_no",
  abandonDate: "abandon_dt",
  drawCode: "mark_draw_cd",
  standardCharacter: "std_char_claim_in",
  sourceFile: "tad_file_id",
} as const;

/** D-24 scope: LIVE = status first digit 6 (pending) or 7 (registered). */
export function isLiveStatus(statusCode: string): boolean {
  const first = statusCode.trim().charAt(0);
  return first === "6" || first === "7";
}

/** Word mark = has literal text AND (word draw code OR standard-character claim). */
export function isWordMark(record: Record<string, string>): boolean {
  const text = (record[RESEARCHER_COLUMNS.markText] ?? "").trim();
  if (text.length === 0) return false;
  const draw = (record[RESEARCHER_COLUMNS.drawCode] ?? "").trim();
  const stdChar = (record[RESEARCHER_COLUMNS.standardCharacter] ?? "").trim().toUpperCase();
  return (WORD_DRAW_CODES as readonly string[]).includes(draw) || stdChar === "Y";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a `YYYY-MM-DD` cell to a UTC-midnight `Date`; empty stays `null`. */
export function parseIsoDate(value: string | undefined): { ok: true; date: Date | null } | { ok: false } {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return { ok: true, date: null };
  if (!ISO_DATE.test(trimmed)) return { ok: false };
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? { ok: false } : { ok: true, date };
}

const emptyToNull = (value: string | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
};

export function parseResearcherRecord(
  record: Record<string, string>,
  sourceFile: string,
): ParseOutcome {
  const serialNumber = (record[RESEARCHER_COLUMNS.serialNumber] ?? "").trim();
  if (serialNumber.length === 0) {
    return { kind: "reject", reason: "missing-serial-number", raw: JSON.stringify(record) };
  }

  if (!isWordMark(record)) return { kind: "skip", reason: "not-a-word-mark" };

  const statusCode = (record[RESEARCHER_COLUMNS.statusCode] ?? "").trim();
  if (!isLiveStatus(statusCode)) return { kind: "skip", reason: "not-live" };

  const filingDate = parseIsoDate(record[RESEARCHER_COLUMNS.filingDate]);
  if (!filingDate.ok) return { kind: "reject", reason: "invalid-filing-date", raw: JSON.stringify(record) };
  const registrationDate = parseIsoDate(record[RESEARCHER_COLUMNS.registrationDate]);
  if (!registrationDate.ok) {
    return { kind: "reject", reason: "invalid-registration-date", raw: JSON.stringify(record) };
  }
  const abandonDate = parseIsoDate(record[RESEARCHER_COLUMNS.abandonDate]);
  if (!abandonDate.ok) return { kind: "reject", reason: "invalid-abandon-date", raw: JSON.stringify(record) };
  const sourceUpdatedAt = parseIsoDate(record[RESEARCHER_COLUMNS.statusDate]);
  if (!sourceUpdatedAt.ok) {
    return { kind: "reject", reason: "invalid-status-date", raw: JSON.stringify(record) };
  }

  const markText = (record[RESEARCHER_COLUMNS.markText] ?? "").trim();
  const mark: CorpusMarkInput = {
    serialNumber,
    registrationNumber: emptyToNull(record[RESEARCHER_COLUMNS.registrationNumber]),
    markText,
    normalizedText: normalizeMarkText(markText),
    statusCode,
    filingDate: filingDate.date,
    registrationDate: registrationDate.date,
    abandonDate: abandonDate.date,
    goodsSummary: null,
    classes: [],
    sourceFile,
    sourceUpdatedAt: sourceUpdatedAt.date,
  };
  return { kind: "record", record: mark };
}
