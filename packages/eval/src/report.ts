/**
 * Gate M5b reporting (P6.4).
 *
 * Turns the retrieval and PII reports into a deterministic ASCII summary and a
 * pass/fail verdict against `EVAL_THRESHOLDS`. The formatter is pure, so its
 * output can be snapshotted and diffed in CI.
 */

import { EVAL_THRESHOLDS } from "./thresholds.js";
import type { RetrievalEvalReport } from "./retrieval-eval.js";
import type { PiiEvalReport } from "./pii-eval.js";

export interface GateResult {
  pass: boolean;
  failures: string[];
}

const fixed = (value: number): string => value.toFixed(4);
const status = (ok: boolean): string => (ok ? "PASS" : "FAIL");

const piiRejectionRate = (pii: PiiEvalReport): number =>
  pii.total === 0 ? 0 : pii.rejected / pii.total;

/** Compare both reports against the gate floors and list every breach. */
export function evaluateGate(retrieval: RetrievalEvalReport, pii: PiiEvalReport): GateResult {
  const failures: string[] = [];

  if (retrieval.recallAtK < EVAL_THRESHOLDS.retrievalRecallAt5) {
    failures.push(
      `retrieval recall@${retrieval.k} ${fixed(retrieval.recallAtK)} < ${fixed(EVAL_THRESHOLDS.retrievalRecallAt5)}`,
    );
  }
  if (retrieval.precisionAtK < EVAL_THRESHOLDS.retrievalPrecisionAt3) {
    failures.push(
      `retrieval precision@3 ${fixed(retrieval.precisionAtK)} < ${fixed(EVAL_THRESHOLDS.retrievalPrecisionAt3)}`,
    );
  }
  if (retrieval.mrr < EVAL_THRESHOLDS.retrievalMrr) {
    failures.push(`retrieval mrr ${fixed(retrieval.mrr)} < ${fixed(EVAL_THRESHOLDS.retrievalMrr)}`);
  }
  const rate = piiRejectionRate(pii);
  if (rate < EVAL_THRESHOLDS.piiRejectionRate) {
    failures.push(`pii rejection rate ${fixed(rate)} < ${fixed(EVAL_THRESHOLDS.piiRejectionRate)}`);
  }
  if (pii.leaked.length > 0) {
    failures.push(`pii leaked vectors: ${pii.leaked.join(", ")}`);
  }
  if (pii.fetchCallsOnRejected > 0) {
    failures.push(`pii fetch calls on rejected: ${pii.fetchCallsOnRejected}`);
  }
  if (!pii.positiveControlOk) {
    failures.push("pii positive control did not resolve");
  }

  return { pass: failures.length === 0, failures };
}

/** Deterministic multi-line ASCII summary of the M5b run. */
export function formatEvalReport(retrieval: RetrievalEvalReport, pii: PiiEvalReport): string {
  const lines: string[] = [];
  const retrievalOk =
    retrieval.recallAtK >= EVAL_THRESHOLDS.retrievalRecallAt5 &&
    retrieval.precisionAtK >= EVAL_THRESHOLDS.retrievalPrecisionAt3 &&
    retrieval.mrr >= EVAL_THRESHOLDS.retrievalMrr;
  const rate = piiRejectionRate(pii);
  const piiOk =
    rate >= EVAL_THRESHOLDS.piiRejectionRate &&
    pii.leaked.length === 0 &&
    pii.fetchCallsOnRejected === 0 &&
    pii.positiveControlOk;
  const gate = evaluateGate(retrieval, pii);

  lines.push("Mark-us P6.4 offline eval (gate M5b)");
  lines.push(`Retrieval: n=${retrieval.total} k=${retrieval.k} ${status(retrievalOk)}`);
  lines.push(
    `  recall@${retrieval.k}    ${fixed(retrieval.recallAtK)} >= ${fixed(EVAL_THRESHOLDS.retrievalRecallAt5)}  ${status(retrieval.recallAtK >= EVAL_THRESHOLDS.retrievalRecallAt5)}`,
  );
  lines.push(
    `  precision@3 ${fixed(retrieval.precisionAtK)} >= ${fixed(EVAL_THRESHOLDS.retrievalPrecisionAt3)}  ${status(retrieval.precisionAtK >= EVAL_THRESHOLDS.retrievalPrecisionAt3)}`,
  );
  lines.push(
    `  mrr         ${fixed(retrieval.mrr)} >= ${fixed(EVAL_THRESHOLDS.retrievalMrr)}  ${status(retrieval.mrr >= EVAL_THRESHOLDS.retrievalMrr)}`,
  );
  if (retrieval.misses.length === 0) {
    lines.push("  misses: none");
  } else {
    lines.push(`  misses: ${retrieval.misses.length}`);
    for (const miss of retrieval.misses) {
      lines.push(`    ${miss.id} got [${miss.got.join(", ")}]`);
    }
  }
  lines.push(`PII guard: n=${pii.total} ${status(piiOk)}`);
  lines.push(
    `  rejection rate ${fixed(rate)} >= ${fixed(EVAL_THRESHOLDS.piiRejectionRate)}  ${status(rate >= EVAL_THRESHOLDS.piiRejectionRate)}`,
  );
  lines.push(`  fetch calls on rejected ${pii.fetchCallsOnRejected}  ${status(pii.fetchCallsOnRejected === 0)}`);
  lines.push(`  leaked: ${pii.leaked.length === 0 ? "none" : pii.leaked.join(", ")}`);
  lines.push(`  positive control ${status(pii.positiveControlOk)}`);
  lines.push(`Gate M5b: ${status(gate.pass)}`);
  if (!gate.pass) {
    for (const failure of gate.failures) lines.push(`  failure: ${failure}`);
  }
  return lines.join("\n");
}
