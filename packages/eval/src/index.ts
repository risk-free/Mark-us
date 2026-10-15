/**
 * Offline eval harness (P6.4) - `@markus/eval`.
 *
 * Scores the P6 chatbot's retrieval quality and its pre-network PII guard
 * against frozen datasets, then reduces both to a single release verdict for
 * gate M5b. Everything is deterministic and offline: no clock, no network, no
 * randomness (M13.6), so a metric move is always traceable to a code change.
 */

export { EVAL_THRESHOLDS } from "./thresholds.js";
export type { EvalThresholds } from "./thresholds.js";

export {
  CLEAN_CONTEXT,
  EVAL_SOURCES,
  PII_CASES,
  PROMPT_MATRIX,
  RETRIEVAL_CASES,
} from "./datasets.js";
export type { PiiCase, PiiVectorKind, RetrievalCase } from "./datasets.js";

export {
  precisionAtK,
  recallAtK,
  reciprocalRank,
  runRetrievalEval,
} from "./retrieval-eval.js";
export type {
  RetrievalCaseResult,
  RetrievalEvalReport,
  RetrievalMiss,
} from "./retrieval-eval.js";

export { TEST_GATEWAY_CONFIG, countingFetch, runPiiEval } from "./pii-eval.js";
export type { PiiEvalReport } from "./pii-eval.js";

export { evaluateGate, formatEvalReport } from "./report.js";
export type { GateResult } from "./report.js";
