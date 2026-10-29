/**
 * USPTO trademark data (D-02, mandate M7.1).
 *
 *  - NO TESS scraping (retired; `tmsearch.uspto.gov` has no official search API)
 *  - Nightly USPTO bulk XML (LIVE only: 600 pending + 700 registered) → local
 *    Postgres corpus. The ODP TDXF feed is gated (FA-011); `Trcfeco2Source` is the
 *    anonymous backfill path until it clears.
 *  - TSDR API for per-mark status (daily T+1 batch, M7.3) — not on the corpus path.
 *  - Upgrade paths documented, not built: A2 OpenSearch (TM5 word marks), A3 BGE.
 *
 * The corpus ingest engine lives in `ingest.ts`; word marks only for now.
 */

export { parseCsvText, rowsToRecords } from "./csv.js";
export { areRelatedClasses, classAdjacency, closestClassDistance, NICE_RELATED_GROUPS, normalizeClass } from "./classes.js";
export type { ClassAdjacency } from "./classes.js";
export {
  disclaimerFor,
  disclaimersByLocale,
  DISCLAIMERS,
  DISCLAIMER_VERSION,
  SUPPORTED_LOCALES,
} from "./disclaimers.js";
export type { Disclaimer, DisclaimerLocale } from "./disclaimers.js";
export { extractFeatures } from "./features.js";
export type { FeatureCandidate, FeatureVector, QueryMark } from "./features.js";
export { corpusFreshness, DEFAULT_FRESHNESS_SLA_HOURS } from "./freshness.js";
export type { CorpusFreshness, CorpusFreshnessStatus } from "./freshness.js";
export { goodsSimilarity, normalizeGoods } from "./goods.js";
export { runCorpusIngest, MAX_REJECT_LOG } from "./ingest.js";
export type { IngestReport, RunCorpusIngestOptions } from "./ingest.js";
export { addMonths, assembleLabelSet, labelFor, temporalSplit } from "./labels.js";
export type { AssembledLabelSet, Label, OutcomeRow } from "./labels.js";
export {
  BASE_RATE,
  BASELINE_MODEL,
  BASELINE_MODEL_VERSION,
  BOOTSTRAP_COEFFICIENTS,
  BOOTSTRAP_MODEL,
  BOOTSTRAP_MODEL_VERSION,
  createLogisticScorer,
  LOGISTIC_FEATURE_ORDER,
  toLogisticScalars,
} from "./model.js";
export type {
  LogisticCoefficients,
  LogisticFeatureName,
  LogisticScalars,
  ScoringModel,
} from "./model.js";
export {
  accuracyAtThreshold,
  auc,
  baselineAccuracy,
  buildCalibrationReport,
  calibrationBuckets,
  ciHalfWidth95,
  DEFAULT_RELEASE_THRESHOLDS,
  evaluateRelease,
} from "./eval.js";
export type { CalibrationBucket, CalibrationReport, EvalSample, ReleaseThresholds } from "./eval.js";
export { normalizeMarkText } from "./normalize.js";
export { phoneticKey, phoneticSimilarity, phoneticTokens } from "./phonetic.js";
export {
  isLiveStatus,
  isWordMark,
  parseIsoDate,
  parseResearcherRecord,
  RESEARCHER_COLUMNS,
  WORD_DRAW_CODES,
} from "./researcher.js";
export {
  defaultArchiveDecoder,
  defaultHttpClient,
  OdpTdxfSource,
  SourceUnavailableError,
  Trcfeco2Source,
} from "./source.js";
export type { ArchiveDecoder, ResearcherHttpClient, TrademarkSource, Trcfeco2SourceOptions } from "./source.js";
export { PrismaCorpusStore } from "./store.js";
export type {
  CorpusRunSummary,
  CorpusStore,
  CorpusTransactionHost,
  FinishRunInput,
  RejectEntry,
  RunCounters,
  UpsertAction,
} from "./store.js";
export {
  HYBRID_NO_CLASS_WEIGHTS,
  HYBRID_WEIGHTS,
  hybridSearchScore,
  PrismaCorpusSearcher,
  SEARCH_CANDIDATE_POOL_SIZE,
  SEARCH_DISCLAIMER,
  SEARCH_METHOD,
  SEARCH_MIN_SCORE,
} from "./search.js";
export type {
  CorpusSearchCandidate,
  CorpusSearchOptions,
  CorpusSearchResult,
  CorpusSqlClient,
  HybridScoreFeatures,
} from "./search.js";
export { CorpusAssessmentScorer, INSUFFICIENT_DATA, scoreCandidates } from "./score.js";
export type {
  AssessmentFeatureSnapshot,
  AssessmentScore,
  AssessmentSubSignals,
  CorpusAssessmentScorerOptions,
  CorpusSearchLike,
} from "./score.js";
export { deriveSuggestions } from "./suggest.js";
export type { AssessmentConfidence, RiskFlag, SuggestionInput, Suggestions } from "./suggest.js";
export {
  ArtifactScoringModel,
  DEFAULT_LABEL_HORIZON_MONTHS,
  InsufficientTrainingLabelsError,
  loadModelArtifact,
  LOGISTIC_CONVERGENCE_TOLERANCE,
  LOGISTIC_L2_REGULARIZATION,
  LOGISTIC_MAX_ITERATIONS,
  MODEL_ARTIFACT_SCHEMA_VERSION,
  ModelReleaseError,
  serializeModelArtifact,
  trainCorpusModel,
  TrainingConvergenceError,
} from "./train.js";
export type {
  CorpusTrainingRow,
  ModelArtifact,
  SplitLabelCounts,
  TrainCorpusModelOptions,
} from "./train.js";
export {
  CURRENT_CORPUS_RECONSTRUCTION_LIMITATION,
  DEFAULT_TRAINING_BATCH_SIZE,
  DEFAULT_TRAINING_COHORT,
  DEFAULT_TRAINING_CORPUS_CONFIG,
  DEFAULT_TRAINING_MAX_EXAMPLES,
  DEFAULT_TRAINING_SEED,
  MAX_TRAINING_BATCH_SIZE,
  TRAINING_SAMPLING_ALGORITHM,
  trainingSampleRank,
  validateTrainingCorpusConfig,
} from "./training-config.js";
export type { TrainingCorpusArtifactMetadata, TrainingCorpusConfig } from "./training-config.js";
export { PrismaCorpusTrainingSource, TRAINING_CANDIDATE_LIMIT } from "./training-corpus.js";
export type {
  TrainingCorpusInstrumentation,
  TrainingCorpusPageMetric,
  TrainingCorpusSearcher,
  TrainingCorpusSqlClient,
  TrainingCorpusTransactionOptions,
} from "./training-corpus.js";
export type { CorpusMarkInput, ParseOutcome } from "./types.js";

/** TSDR per-mark lookup (M7.3) — status only, daily T+1 batch. Lands in P5. */
export interface TsdrStatus {
  serialNumber: string;
  status: string;
  filingDate?: string;
  registrationNumber?: string;
  raw: unknown;
}

export async function fetchTsdr(serialNumber: string): Promise<TsdrStatus> {
  void serialNumber;
  throw new Error("@markus/tm-data: fetchTsdr not implemented (lands with M7.3)");
}
