/**
 * USPTO corpus vocabulary (D-02, mandate M7.1).
 *
 * A `CorpusMarkInput` is one word mark reduced to the derived fields the D-02
 * baseline is allowed to store (mark text, class, status, dates). A source emits
 * a stream of `ParseOutcome`s: a well-formed record, a deliberate skip
 * (non-word / non-LIVE mark — not an error), or a quarantine (`reject`) so a
 * single malformed row never fails the run.
 */

export interface CorpusMarkInput {
  /** USPTO serial number — the natural key (`TmCorpusMark.serialNumber` unique). */
  serialNumber: string;
  registrationNumber: string | null;
  /** Literal word mark text. */
  markText: string;
  /** Derived, query-time form: lower/unaccented/whitespace-collapsed. */
  normalizedText: string;
  /** `cfh_status_cd` — LIVE is first digit 6 (pending) or 7 (registered). */
  statusCode: string;
  filingDate: Date | null;
  registrationDate: Date | null;
  abandonDate: Date | null;
  goodsSummary: string | null;
  /** Nice class ids, e.g. `["025"]`. Empty when the source carries no classes. */
  classes: readonly string[];
  /** Provenance: the source file this record came from. */
  sourceFile: string;
  /** Provenance: the source's own last-updated date, used to detect changes. */
  sourceUpdatedAt: Date | null;
}

export type ParseOutcome =
  | { kind: "record"; record: CorpusMarkInput }
  | { kind: "skip"; reason: string }
  | { kind: "reject"; reason: string; raw: string };
