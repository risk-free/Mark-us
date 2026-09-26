# Mark-US — 美国商标申请平台

Cross-border e-commerce US trademark application & management platform
(assessment → application → OA response → status → payment/invoicing → CRM),
served by PRC lawyers with US bar admission (D-01).

## Docs (authoritative)

| Doc | Purpose |
| --- | --- |
| [PRD.md](./PRD.md) | Requirements v2.0 — reviewed & approved |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | D-01…D-14 architecture/decision log |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design, monorepo layout, RBAC, flows |
| [docs/SCHEDULE.md](./docs/SCHEDULE.md) | P0–P8 man-day plan, M0–M7 gates |

## Quickstart

```bash
pnpm install
docker compose up -d          # postgres:5432, redis:6379
cp .env.example .env          # fill in secrets; dev fallbacks in comments
pnpm db:generate              # prisma generate
pnpm db:migrate               # prisma migrate dev  (creates baseline)
pnpm dev                      # turbo: apps/web (:3000) + apps/api (:3001)
```

Checks: `pnpm typecheck` · `pnpm test` · `pnpm build`

## Layout

```
apps/web       Next.js 15 (App Router, Tailwind 4) — marketing + route groups /portal /expert /crm /admin
apps/api       Hono REST API (BFF; server-only secrets: KMS, Stripe, WeCom, LLM)
workers        BullMQ jobs: ocr, tm-ingest, archive-sync, llm, reconcile
packages/db    Prisma schema (authoritative data model)
packages/core  RBAC matrix + shared validators
packages/llm-gateway  OpenAI-compatible router (primary CN provider + fallback, BGE embeddings)
packages/wechat       WeCom: 微信客服 / 客户联系 / 会话存档
packages/payments     Stripe HK + PayPal facade (itemized invoices)
packages/tm-data      USPTO TSDR + daily bulk XML ingest (no TESS scraping)
infra          Dockerfiles / deployment
```

## Non-negotiables

- No self-registration; staff accounts provisioned by Master Admin (D-06).
- USPTO credentials: envelope-encrypted vault, MFA seed never stored, `AuditLog` on every read (D-01).
- No TESS scraping; LIVE-only corpus, word marks first (D-02).
- Probability output always carries model version + 3-locale disclaimers; no accuracy marketing claims (D-03).
- Client PII never sent to third-party LLMs (D-04).
- Staffed-response expectations, not uptime SLAs (D-07).
