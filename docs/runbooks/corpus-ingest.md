# Corpus ingest runbook (M7.1)

## Surfaces
- Nightly: BullMQ repeatable job `nightly` on the `tm-ingest` queue at 03:00 UTC (`DAILY_CRON`, workers/src/tm-ingest.ts), registered by the worker process when `RUN_WORKER=1` and `TM_CORPUS_INGEST_ENABLED=true`. It runs the corpus ingest for the previous UTC day.
- One-off backfill: `pnpm --filter @markus/workers ingest:backfill -- --years 2004-2023` (in-process, no Redis, no HTTP surface). `--years` accepts an inclusive range (`2004-2023`) or a comma list (`2004,2005,2006`); `--table` selects the researcher table (default `case_file`). Prints the `IngestReport` as JSON; exits non-zero on failure.
- Status: `GET /tm/ingest/runs` (MASTER_ADMIN) reads the `TmIngestRun` ledger; `GET /tm/freshness` exposes staleness.

## Env flags
- `TM_CORPUS_INGEST_ENABLED` — opens the `tm-ingest` worker + registers the cron. Off by default.
- `TM_CORPUS_INGEST_YEARS` — optional default year set for queue payloads that omit `years` (comma string, e.g. `2004,2005`). Nightly default is the runDate's year.
- `TM_CORPUS_INGEST_SOURCE` — `trcfeco2` (default) or `tdxf`; the FA-011 swap-in switch.
- `USPTO_BULK_BASE_URL` (default `https://data.uspto.gov`), `USPTO_RESEARCHER_PRODUCT_ID` (default `TRCFECO2`) — researcher signed-URL endpoints. Legacy bulkdata.uspto.gov is DNS-dead.
- `DATABASE_URL` — the backfill CLI drives PrismaCorpusStore directly.

## Nightly semantics while FA-011 is open
- The researcher TRCFECO2 snapshot is static; re-ingesting it nightly would burn a 434 MB-per-year download for zero deltas. While the effective source set is researcher-only, the nightly tick logs `researcher snapshot static; TDXF nightly pending FA-011` and exits 0 — no ledger row, no retry.
- Selecting `tdxf` before FA-011 clears (env or payload) skips with the FA-011 reason instead of failing; a non-FA-011 source error fails the job so BullMQ records it (the engine has already written `failRun`).
- FA-011 (Attorneys): firm USPTO.gov account + 4 ODP profile fields + API key. On clearance, set `TM_CORPUS_INGEST_SOURCE=tdxf` and implement `OdpTdxfSource.fetchRecords` (source.ts) — the cron registration already stays in place.

## Backfill invocation (staging/prod, ops-run)
1. Confirm `DATABASE_URL` points at the target and migrations are applied (`TmIngestRun`/`TmCorpusMark` exist).
2. Run `pnpm --filter @markus/workers ingest:backfill -- --years 2004-2023` (full researcher history, per ARCH-05).
3. Watch stdout for the JSON `IngestReport` (`marksImported`/`marksUpdated`/`marksRejected`) and confirm the run row via `GET /tm/ingest/runs`.

## Resume semantics
- The ledger run is find-or-created by `runDate` (default: previous UTC day) and mark upserts are idempotent (serial-number keyed), so a crashed backfill is resumed by re-running the same command within the same UTC day; rows already upserted read as `skipped`/`updated`, not duplicated.
- A failed run leaves a `failed` ledger row with the engine's error log; it does not block the next run.

## Expected scale
- ~12.7 M marks across the full researcher history; 25–50 GB of archives; hours-long wall clock. The runner streams rows and upserts per record, so memory stays flat; the cost is bandwidth and Postgres write throughput.
- Rejects land in the run's `errorLog` (bounded); investigate a high `marksRejected` count before re-running.
