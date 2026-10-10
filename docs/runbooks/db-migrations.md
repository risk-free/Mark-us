# Runbook — database migrations

*Authority: `docs/architecture/02-data-model.md` §7 (protocol) and `docs/architecture/04-implementation-mandates.md` M3.1 (GATE). Owner of this runbook: Developer, reviewed by the Architect.*

---

## 1. How a migration is produced

`packages/db/prisma/schema.prisma` is the only schema authority. A migration is never
hand-written end to end; it is assembled from two reproducible inputs:

```bash
pnpm db:build-migration      # regenerates migration.sql from the two inputs below
```

| Input | Contains | Authored by |
| --- | --- | --- |
| `prisma/schema.prisma` | tables, columns, types, enums, relations, model-level indexes | Prisma DMMF, machine-generated into the migration |
| `prisma/migrations/<name>/fragments/*.sql` | extensions, sequences, CHECK constraints, partial/functional/GIN/BRIN indexes, autovacuum | human — Prisma cannot express these |

`scripts/build-baseline-migration.mjs` concatenates them in lexical fragment order and
writes `migration.sql`. **Never edit `migration.sql` by hand**: the next build overwrites
it, and CI fails the moment it disagrees with its inputs.

## 2. Drift gates (run on every PR and on `main`)

| Gate | Command | Proves |
| --- | --- | --- |
| Schema is valid | `pnpm db:validate` | the DMMF parses and every relation resolves |
| Migration matches its inputs | `pnpm db:drift` | no one edited `schema.prisma` without regenerating |
| Migrated database matches the schema | `pnpm db:drift` **with** `DATABASE_URL` | `prisma migrate diff --from-migrations --to-schema-datamodel` is empty against a real Postgres |
| Applied for real | `pnpm db:deploy` | migrations apply to an empty database without manual repair |

The third gate is the one that matters and the one that cannot run without a database:
CI provides a `postgres:16-alpine` service; a developer needs `docker compose up -d`.

## 3. Current migration

### `0P3__p0_3_backlog` — the baseline

The repository had **no prior migration**: `prisma/schema.prisma` existed without a
`migrations/` directory. This migration is therefore a *full baseline* that materialises
the P0 v1 schema **and** the `ARCH-02` §5 P0.3 backlog in one step, not a delta.

Consequences worth knowing:

- `ARCH-02` §5.4's `ALTER COLUMN … TYPE timestamptz(3)` conversion is **subsumed**: instant
  columns are declared `timestamptz(3)` from the start. There is no 8-hour-of-silence
  window in which instants were stored without a zone.
- It creates 35 tables, 103 indexes, 60 constraints, 2 extensions and 2 sequences.
- **Lock level:** `ACCESS EXCLUSIVE` on catalog objects only. No table holds rows, so
  there is no rewrite, no table copy and no long lock. Measured duration is logged by the
  CI step.
- **Rollback: irreversible as a script.** On a scratch database:
  `DROP SCHEMA public CASCADE` then `pnpm db:migrate`. On anything real: restore from
  backup. Nothing in this migration destroys pre-existing data because nothing
  pre-existed — which is precisely why it must never be applied to a populated database
  without a fresh review.

Items Prisma cannot express, and where they live:

| Concern | Location | Notes |
| --- | --- | --- |
| `pg_trgm`, `unaccent` | fragment `10-extensions-and-sequences.sql` | `unaccent` is applied at ingest, never in an index predicate (it is only `STABLE`) |
| `seq_order_number`, `seq_invoice_number` | fragment `10` | the application calls `nextval()` inside the inserting transaction |
| CHECK constraints (money ≥ 0, score 0–1, `filingMethod = 'ATTENDED'`, magic-link expiry, outbox payload version) | fragment `20-integrity-and-indexes.sql` | `ck_filing_attended` makes an unattended filing physically unrecordable |
| Partial unique indexes (`Payment.providerEventId`, `Message.(conversationId, wecomMsgid)`, `Conversation.(channel, wecomSessionId)`) | fragment `20` | replay-safety for webhooks and 会话存档 |
| GIN trigram on `TmCorpusMark.normalizedText` | fragment `20` | the P5 critical path; `ILIKE` is forbidden |
| GIN on `Contact.tags`, BRIN on `AuditLog.createdAt`, autovacuum on high-churn tables | fragment `20` | `ARCH-02` §4.1, §4.2.5 |
| Functional unique indexes on `lower(email)` | fragment `20` | stops `Admin@x.com` and `admin@x.com` becoming two identities |

## 4. Rules for the next migration (ARCH-02 §7)

1. **Expand-then-contract.** Release *n* adds; *n+1* backfills and switches reads; *n+2*
   removes. `DROP`, narrowing `TYPE` and `NOT NULL` on populated tables never ship in the
   same release as the code that stops using the column.
2. **One migration per concern**, named `<phase>__<concern>`, forward-only in the
   repository, with a rollback note added to this runbook in the same PR.
3. **Never edit an applied migration.** Correct it forward in a new one.
4. **`CREATE INDEX CONCURRENTLY`** for anything on a large table, outside a transaction.
5. **Batched backfills** — 1 000 rows per transaction with a recorded resume point.
6. **Money and instants are already enforced** by the baseline's constraints and column
   types; do not re-add them per model.
7. **State the lock level** in the PR description for any table above 100 000 rows.

## 5. Deployment

Migrations run as exactly one gated step before the new application version starts
(M14.3), never concurrently from several replicas:

```
migrate-staging (pg_advisory_lock)  →  deploy-staging (smoke)  →  deploy-prod (approval)
```

`infra/compose.staging.yml` implements this as a one-shot `migrate` service that every
long-running service `depends_on` with `condition: service_completed_successfully`, so a
failed migration leaves the previous release running and `deploy.sh` exits non-zero
without touching it. Rollback of the application is the previous image tag; the database
is only rolled back where the runbook above documents a reversible path.

## 6. Open items carried by the schema

| Item | Where | Status |
| --- | --- | --- |
| `AuditLog` monthly RANGE partitioning (§6) conflicts with a single-field Prisma `@id` | fragment `20` header | **DQ-020** — BRIN + autovacuum is the interim |
| `TrademarkAssessmentFactors` is named in M3.2 but not modelled in §5.1 | `schema.prisma` | **DQ-021** — implemented as `subSignals` + `featureSnapshot` per §5.1 |
| Money precision: `Decimal(12,2)` (§1) vs `Decimal(14,2)` (M3.3) | `schema.prisma` | **DQ-019** — kept at 12,2 pending the Architect's ruling |
| Pipeline/funnel rollup tables (M11.2) | not yet modelled | DQ-003 — delivered with P7 |
