# Offline trademark model training

P5.4/P5.4.1 provides an offline trainer only. It does not activate a model,
change production model selection, or satisfy the attorney/M5a promotion gate.
Production continues to use `BOOTSTRAP_MODEL` until a separate promotion decision.

## Command

```sh
pnpm --filter @markus/workers model:train -- \
  --model-version logistic-2020-v1 \
  --cutoff 2020-01-01 \
  --census 2022-01-01 \
  --output artifacts/logistic-2020-v1.json \
  --cohort live-v1 \
  --seed 0 \
  --max-examples 50000 \
  --batch-size 500
```

`DATABASE_URL` must identify PostgreSQL. The command needs no unrelated web or
worker secrets and exposes no HTTP surface.

## Cohort, sampling, and memory bounds

- The base cohort contains live 600/700 rows with non-null filing dates at or
  before `--census`. `--cohort` records its logical name in the artifact.
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
  release gates; choose a sample size/seed that covers both temporal splits.
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
