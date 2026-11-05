# Offline trademark model training

P5.4/P5.4.1 provides an offline trainer only. It does not activate a model,
change production model selection, or satisfy the attorney/M5a promotion gate.
Production continues to use `BOOTSTRAP_MODEL` until a separate promotion decision.

## Single capped evaluation profile (prepared 2026-11-06; not executed)

The owner has authorised **exactly one** real-corpus invocation against the existing local USPTO
`TmCorpusMark` corpus. This is not authorisation for a parameter sweep, a second attempt, or model
activation. The frozen invocation profile is:

| Setting | Value |
|---|---|
| Model version / artifact schema | `logistic-2020-v1` / schema v2 |
| Cohort | `live-v1` — whole LIVE USPTO corpus, status codes beginning `6`/`7`, no origin filter |
| Training cutoff | `2020-01-01T00:00:00.000Z` — earlier filing dates train; at/after this date is holdout |
| Logical census | `2022-01-01T00:00:00.000Z` |
| Label horizon / accuracy threshold | 12 months / `0.5` (the latter is fixed by `eval.ts` and D-32) |
| Sampling | seed `0`, `hash-top-n-v1`, maximum `50000` examples |
| Selection batch size | `500` |
| Release floors | 500 resolved HOLDOUT labels; accuracy 95% CI half-width <= 5 pp; AUC >= 0.70; accuracy lift >= 10 pp |
| Output | `artifacts/logistic-2020-v1.json`, exclusive create |

The census is a retrospective label-observation cutoff, not a claim that the current corpus is a
point-in-time snapshot from that date. The historical-reconstruction limitation below still applies.

### Preconditions

1. An approved PostgreSQL/corpus-access environment supplies `DATABASE_URL`. No real-corpus run on
   the development host is implied or authorised by this document.
2. A named, active `EXPERT` attorney is available for the subsequent spot-check of at least 50
   HOLDOUT labels. No attorney has yet been named in this repository.
3. A read-only corpus preflight confirms the `TmCorpusMark` watermark and TDXF-derived event/status
   coverage can resolve both positive and negative labels at the logical census. If abandonment
   evidence is inadequate, stop; do not substitute research status codes or treat pending as negative.
4. Record the clean trainer commit and confirm the output path does not already exist. Keep the
   trainer log and any artifact in approved evidence storage; never commit host/ACL details or corpus
   extracts to the public tree.

### The one authorised invocation

```sh
pnpm --filter @markus/workers model:train -- \
  --model-version logistic-2020-v1 \
  --cutoff 2020-01-01 \
  --census 2022-01-01 \
  --horizon-months 12 \
  --min-resolved-labels 500 \
  --max-ci-half-width-pp 5 \
  --min-auc 0.7 \
  --min-lift-pp 10 \
  --output artifacts/logistic-2020-v1.json \
  --cohort live-v1 \
  --seed 0 \
  --max-examples 50000 \
  --batch-size 500
```

`DATABASE_URL` must identify the approved PostgreSQL database. The command needs no unrelated web
or worker secrets and exposes no HTTP surface.

### Stop conditions and evidence

- Capture start/end time, trainer commit, full trainer log, exit status, actual sample/label counts,
  evaluation report and release-gate reasons. If an artifact is produced, record its SHA-256.
- **One started invocation consumes this authorisation.** Do not retry after a failure, change a date,
  seed, horizon, threshold or sample bound, or delete an artifact to make another attempt. Any such
  change requires fresh owner approval and a new model version/evaluation.
- A failed run writes no artifact and no registry/evaluation/label rows; its log is the failure
  evidence. An empty/single-class split or missed release floor is a failed run, not a reason to
  weaken the gates.
- This CLI writes only a schema-v2 artifact on success. It does **not** persist `ProbabilityModel`,
  `ModelEvaluation`, or `CorpusLabel`; P5.4.2 needs a measured execution profile and a separate
  evidence writer before a contract-v1.0 database evaluation can be promoted. Do not run the trainer
  again merely to reconstruct missing persistence evidence.
- Even a passing artifact does not activate a model or satisfy M5a by itself. Attorney spot-check,
  schema-v2 evidence/promotion review, the frozen approval quorum and a separate owner promotion
  decision remain mandatory. Production stays on `BOOTSTRAP_MODEL`.

## Cohort, sampling, and memory bounds

- The base cohort contains LIVE rows whose status code begins `6` or `7`, with
  non-null filing dates at or before `--census`. `--cohort` records its logical
  name in the artifact.
- `--seed` and `--max-examples` select the globally lowest deterministic hash
  ranks, with serial number as the tie-breaker (`hash-top-n-v1`). Selection is
  independent of page size and processing order and finishes before per-mark
  candidate retrieval. It is not chronological first-N truncation.
- Rows are read in keyset order `(filingDate, serialNumber)` with no `OFFSET`.
  All selection pages share one repeatable-read transaction, preventing
  concurrent ingest from moving rows across the cursor. Per-mark feature
  retrieval starts only after that selection transaction ends.
- During selection, measured outcome-row occupancy is bounded by
  `--batch-size + --max-examples`: one page plus the bounded sample heap.
- The CLI retains at most `--max-examples` streamed feature rows for fitting.
  A small or unlucky sample can leave an empty or single-class temporal
  holdout. This is a failed training run, not permission to weaken the split or
  release gates. For the capped profile above it also consumes the authorised
  invocation; changing the sample size or seed requires fresh owner approval.
- D-24/D-26 labeling, temporal holdout evaluation, and release thresholds run
  after sampling. Pending/censored rows are never negative labels.

The artifact is written with exclusive-create semantics only after training and
all release gates pass. An existing artifact is never overwritten; a failed run
writes no artifact.

Schema-v2 artifacts record the cohort name, seed, sampling algorithm, actual
sample size (including censored rows), maximum examples, batch size, label
counts, evaluation, release-gate evidence, and the historical-reconstruction
limitation.

## Historical-reconstruction limitation

Training features are reconstructed from the **current corpus**, not from a
point-in-time snapshot of the corpus as it existed on each historical filing
date. Self and later-filed candidates are excluded in SQL before retrieval
limits, but historical text, class, goods, and outcome data may since have
changed. Evaluation results must retain this limitation; the trainer does not
claim historical point-in-time reconstruction.

Do not run this command against the real 12.7M-row corpus as part of the P5.4.1
code gate. Full-corpus execution, attorney spot-check, model promotion, and M5a
sign-off are separate activities.
