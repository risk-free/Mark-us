# Mark-US — 美国商标申请平台

Cross-border e-commerce US trademark application & management platform
(assessment → application → OA response → status → payment/invoicing → CRM),
served by PRC lawyers with US bar admission (D-01).

## Docs (authoritative)

| Doc | Purpose |
| --- | --- |
| [PRD.md](./PRD.md) | Requirements v2.0 — reviewed & approved |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | D-01…D-15 architecture/decision log |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | **Superseded** — historical narrative and rationale only, not an implementation source |
| [docs/SCHEDULE.md](./docs/SCHEDULE.md) | P0–P8 man-day plan, M0–M7 gates |
| [docs/architecture/](./docs/architecture/) | **Architecture of record** — system design, data model, OpenAPI contract, implementation mandates (approved) |
| [docs/DESIGN-QUESTIONS.md](./docs/DESIGN-QUESTIONS.md) | Open design questions (DQ-001…) — raise here before deciding in code |
| [infra/README.md](./infra/README.md) | Images, local full-stack, staging deploy/bootstrap, pipeline map |

## Quickstart

```bash
pnpm install
docker compose up -d          # postgres:5432, redis:6379
cp .env.example .env          # fill in secrets; SESSION_SECRET is required (see the file)
pnpm db:generate              # prisma generate
pnpm db:migrate -- init       # baseline migration (needs a reachable Postgres)
pnpm dev                      # turbo: apps/web (:3000) + apps/api (:3001)
```

Checks (run all four before pushing): `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`

Full stack in containers: `docker compose --profile app up -d --build --wait`

## Layout

```
apps/web       Next.js 15 (App Router, Tailwind 4) — marketing + route groups /portal /expert /crm /admin
apps/api       Hono REST API (BFF; server-only secrets: KMS, Stripe, WeCom, LLM)
workers        BullMQ jobs: ocr, tm-ingest, archive-sync, llm, reconcile
packages/db    Prisma schema (authoritative data model)
packages/core  RBAC matrix + shared validators
packages/config  env schema (zod, fail-fast boot gate) + eslint/jest presets
packages/llm-gateway  OpenAI-compatible router (primary CN provider + fallback, BGE embeddings)
packages/wechat       WeCom: 微信客服 / 客户联系 / 会话存档
packages/payments     Stripe HK + PayPal facade (itemized invoices)
packages/tm-data      USPTO TSDR + daily bulk XML ingest (no TESS scraping)
infra          Dockerfiles, compose (local + staging), host deploy scripts, runbook
```

## Environment

`packages/config` validates the environment against a zod schema at boot: the API and
worker **refuse to start** in `staging`/`production` without `KMS_KEY_ID`, a
KMS-wrapped `VAULT_MASTER_KEY`, and non-local `DATABASE_URL`/`REDIS_URL` (D-01).
`NODE_ENV` has no default — an omitted value is an error, so the gate can never be
skipped by accident. Names mirror `.env.example` (a test enforces it) and validation
errors never echo values. Outside production the entrypoints load `.env` via `dotenv`;
in production env vars come from the platform only.


## Non-negotiables

- No self-registration; staff accounts provisioned by Master Admin (D-06).
- USPTO credentials: envelope-encrypted vault, MFA seed never stored, `AuditLog` on every read (D-01).
- No TESS scraping; LIVE-only corpus, word marks first (D-02).
- Probability output always carries model version + 3-locale disclaimers; no accuracy marketing claims (D-03).
- Client PII never sent to third-party LLMs (D-04).
- Staffed-response expectations, not uptime SLAs (D-07).
