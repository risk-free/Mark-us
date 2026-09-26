# Architecture — MarkUS (US Trademark Application Platform)

*Created: 2026-09-26 | Companion to PRD v2.0 | Decisions: docs/DECISIONS.md*

---

## 1. System Overview

```
                                  ┌─────────────────────────────────────────────┐
   Visitors (zh-CN/en/zh-TW)      │           MARKETING (edge)                 │
  ────────────────────────────▶   │  Next.js 15 static/SSG, next-intl, SEO/GEO │  Vercel/Cloudflare CDN
                                  └──────────────┬──────────────────────────────┘
                                                 │ CTA: QR / 微信客服 link / widget
   Clients (personal WeChat)                     ▼
  ────────────────────────────▶   ┌──────────────────────────┐    official APIs
                                  │  WeCom (企业微信)         │◄────────────────────┐
   Salespersons (WeCom app)       │  · 微信客服 session queue │                     │
  ────────────────────────────▶   │  · 客户联系 friend-add    │              ┌──────┴───────┐
                                  │  · 会话存档 archive       │─────────────▶│  API (Hono)  │
                                  └──────────────────────────┘   callbacks   │  Node 20+    │
                                                                             └──────┬───────┘
                     Magic-link portal (upload/status/pay)                          │
   Contacts ─────────────────────▶┌──────────────────────────┐                      │
                                  │  apps/web (Next.js App)  │◄────── JSON ─────────┤
                                  └──────────────────────────┘                      │
                                                                                    ▼
        ┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌────────────────────────┐
        │ PostgreSQL    │   │ Redis         │   │ R2 / S3       │   │ Workers (BullMQ)       │
        │ Prisma        │   │ cache + queue │   │ docs (enc.)   │   │ · OCR/proofread        │
        │ live TM index │   │ scores 24h    │   │ invoice PDFs  │   │ · USPTO daily ingest   │
        └───────────────┘   └───────────────┘   └───────────────┘   │ · WeCom archive sync   │
                                                                    │ · LLM gateway calls    │
                                                                    │ · reconciliation       │
                                                                    └───────────┬────────────┘
                     ┌───────────────┬───────────────┬─────────────┬────────────┴───┐
                     ▼               ▼               ▼             ▼                ▼
               Stripe HK        PayPal          USPTO APIs     China LLMs      LanguageTool
        (cards/Alipay/WeChat)               (bulk XML+TSDR)  (DeepSeek/GLM/    (+ PaddleOCR)
                                               API key        Kimi, OpenAI-compat)
```

**Topology:** single HK region for API/DB/workers/R2; marketing edge CDN (Vercel/Cloudflare) for mainland-reachable delivery; `.com` domain; no ICP/`.cn` (deferred).

---

## 2. Monorepo Layout

```
mark-us/
├── apps/
│   ├── web/                  Next.js 15 (App Router) — marketing + portal + staff UIs
│   │   └── src/app/          (marketing)  [locale]/…            — public, SSG
│   │                         (portal)     portal/…              — magic-link sessions
│   │                         (staff)      expert/ crm/ admin/   — RBAC route groups
│   └── api/                  Hono (Node 20) — REST API + callbacks (WeCom/webhooks)
├── packages/
│   ├── db/                   Prisma schema + migrations + seed
│   ├── core/                 shared types, zod schemas, result/error, RBAC matrix
│   ├── llm-gateway/          OpenAI-compatible abstraction, model-per-task, fallbacks
│   ├── wechat/               WeCom SDK: 客服 sessions, 客户联系, 会话存档 ingest
│   ├── payments/             Stripe + PayPal adapters, webhooks (idempotent), invoices
│   ├── tm-data/              USPTO bulk XML parser, ingest, similarity engine, scoring
│   └── config/               eslint/tsconfig presets, env schema (zod)
├── workers/                  BullMQ processors (OCR, ingest, archive, LLM, reconcile)
├── infra/                    Dockerfiles, compose, IaC, runbooks
├── .github/workflows/        CI/CD
└── docs/                     ARCHITECTURE · SCHEDULE · DECISIONS
```

Tooling: **pnpm workspaces + Turborepo**; TypeScript strict; changesets-free (single product).

---

## 3. Auth & RBAC

### 3.1 Principals
| Principal | Auth mechanism |
|---|---|
| Staff (Master Admin / Expert / Salesperson) | Email+password or magic link → **JWT with role claims** (short-lived AT + rotating RT). Accounts **only** created by Master Admin |
| Contact (client) | **Magic-link token** (single-use, hashed at rest, 15-min TTL, bound to contact_id + scope). No passwords, no registration |
| WeCom (external) | WeCom access_token (corp credentials), callback URL verification, IP allowlist |
| Webhooks (Stripe/PayPal) | Signature verification + idempotency ledger |

### 3.2 Enforcement (two layers, PRD §6.2)
1. **Middleware** (`apps/web`): route-group guards — `/portal/*` requires contact session scope; `/expert/*`, `/crm/*`, `/admin/*` require role claims.
2. **API guards** (`apps/api`): every handler calls `requireRole(...)` / `requireContact(...)`; row-level scoping (salesperson sees assigned contacts only; expert sees assigned/all cases per policy; Master Admin sees all). Deny-by-default policy table lives in `packages/core/rbac.ts` (single source of truth, unit-tested).

### 3.3 USPTO credential vault (D-01)
- Per-attorney record: `uspto_username` + `password_ciphertext` (AES-256-GCM data key, wrapped by KMS master key).
- Decrypt **only** inside an audited, attorney-initiated assisted-login flow; plaintext never logged, never returned to any other principal; **MFA seed never stored**.
- Every access → `AuditLog` row (actor, ip, reason). Filing signature remains manual (attorney, 37 CFR 2.193).

---

## 4. Core Flows

### 4.1 Lead → assignment (≤5 min SLA)
```
WeChat user → 微信客服 QR/link → WeCom KF callback → api/wecom/kf/* 
  → upsert Contact (WeComLink) → Lead created (tags from AI qualification)
  → round-robin picker (least-recently-assigned, business hours) → assign via KF session API
  → Notification to salesperson; Conversation created; clock starts (metric)
```

### 4.2 Archive sync (会话存档)
```
BullMQ cron (5 min) → archive API pull (per consented member range)
  → decrypt (SDK) → normalize → upsert Conversation/Message
  → ConsentRecord check: skip non-consented members/contacts
  → supervision views + ERP metrics read from our DB (never raw WeCom in ERP queries)
```

### 4.3 Portal session
```
Salesperson: create Contact → generate magic link (random 256-bit, hashed in DB)
  → delivered via WeCom message or email → Contact opens → claim (single-use)
  → session cookie (HttpOnly, SameSite=Lax) scoped to contact_id → portal APIs
```

### 4.4 Payment (itemized, D-05)
```
Order + line items (SERVICE_FEE | USPTO_FEE) → invoice PDF (zh/en) rendered →
Stripe Checkout / Payment Link (cards · Apple/Google Pay · mainland Alipay · mainland WeChat)
  or PayPal → webhook (verify sig → idempotency key → Payment row → Order.paid)
  → Notification + portal unlock → reconciliation job (daily, ledger vs provider report)
Refunds: per line item, partial allowed; USPTO_FEE refund policy per business rules.
```

### 4.5 USPTO ingest + scoring (D-02/D-03)
```
Daily 06:00 HKT: download bulk Applications XML (~17MB gz) → parse (streaming)
  → upsert live-only rows (pending 600s + registered 700s; drop dead) → pg_trgm refresh
Assessment request:
  normalize candidate → top-N by trigram/phonetic + class adjacency (+ goods similarity)
  → features → scoring model (versioned) → P(registration) 0–100 + sub-signals
  → Redis cache (24h key: hash(mark+class+goods+model_version)) → API <10s p95
  → disclaimer rendered always (3 locales)
Evaluation (offline, CI-scheduled): temporal hold-out cohort → AUC / accuracy-vs-baseline /
  calibration report → gates (M5). Model version stamped on every stored score.
```

### 4.6 LLM gateway (D-04)
```
call(task, messages) → task config {primary model, fallback, max_tokens, pii_mode}
  tasks: lead_qualification · oa_classification · suggestions · chatbot · proofread_rewrite
  · embeddings (BGE, self-hosted)
All China-based models behind OpenAI-compatible endpoints (international/HK routes);
retry w/ exponential backoff + circuit breaker; token/cost metering per task;
PII minimization: contacts pseudonymized in prompts unless task requires identity.
```

---

## 5. Data Architecture

- **Primary store**: PostgreSQL (Prisma). Approx sizing: app data <20 GB + **live TM index ~15–25 GB** (with `pg_trgm` + FST indexes) → db.t4g.medium-class is ample (A1 lean).
- **Redis**: BullMQ queues, assessment cache (24h), rate limits, round-robin state.
- **R2/S3**: documents (server-side encrypted, presigned upload, malware scan worker), invoice PDFs, raw USPTO archives (7-day retention, $<1/mo).
- **Key indexes**: `tm_index(mark_norm)` GIN trgm · `tm_index(class)` · `conversation(contact_id)` · `message(conversation_id, created_at)` · `audit_log(actor_id, created_at DESC)`.
- **Backups**: nightly pg_dump → object storage (30-day), monthly restore drill (P8 runbook).
- Full schema: `packages/db/prisma/schema.prisma`.

---

## 6. Security & Privacy posture

| Area | Control |
|---|---|
| Payments | Stripe Elements / hosted checkout → PCI-DSS SAQ-A (no card data on our servers); webhook signatures + idempotency |
| Credentials | USPTO vault envelope encryption (KMS), per-attorney ACL, no MFA seeds, audit every read (D-01) |
| Documents | Encrypted at rest, presigned short-TTL uploads, AV scan, per-contact row scoping |
| RBAC | Deny-by-default matrix in `packages/core`, enforced middleware + API (§3.2) |
| PIPL | Consent banner + privacy policy (zh/en), ConsentRecord per archive subject, PII minimization before LLM calls, no Google Analytics, DPA with sub-processors (Stripe/PayPal/R2/LLM providers) |
| 会话存档 | Built-in dual-side notices + our ConsentRecord ledger; role-scoped archive views; every view audited |
| Secrets | GitHub Actions secrets + runtime KMS; no `.env` in images |
| Supply chain | `pnpm audit` + Dependabot in CI; lockfile-only installs |

---

## 7. Observability & resource monitoring (P0 deliverable)

- **App**: Sentry (errors, tracing) across web/api/workers.
- **Product analytics**: self-hosted PostHog *or* Umami — funnel events: `site_view → chat_open → contact_created → magic_link_claimed → order_paid` (D-07).
- **Infra dashboards**: uptime (blackbox), API latency p95, error rate, queue depth/age, DB connections/size/disk, CPU/mem, Redis mem, R2 egress, **per-module cost** (HK infra + LLM token spend + WeCom license amortized).
- **Integration health**: synthetic probes — WeCom token refresh, TSDR API ping, Stripe API ping, LLM canary (1 call/day), daily-ingest freshness timestamp alert (>36h stale = page).
- **Alerts**: Sentry → Slack/webhook; Pager-lite for M-gate-critical jobs (ingest, webhook consumer).

---

## 8. CI/CD & environments

```
PR → GitHub Actions: lint → typecheck → unit (Jest) → build → integration (services via compose)
  → merge to main → build images → deploy staging (auto) → smoke suite →
  manual gate (phase milestone) → deploy prod (feature-flagged) → health check → auto-rollback on fail
```

- **Environments**: local (compose: pg/redis) · staging (HK, seeded, WeCom/Stripe *test* mode) · prod (HK).
- **Feature flags**: flags per phase subphase (Unleash-lite or env-based) so out-of-order deploys stay hidden.
- **Definition of Done (per subphase)**: code + tests green in CI, staging deploy, demo at phase gate, docs/ADRs updated.

---

## 8.1 Capacity & cost envelope (steady state, A1 lean)

| Item | Monthly (USD, est.) |
|---|---|
| HK compute (API + workers + staging) | 80–150 |
| Managed Postgres (30–50 GB incl. TM index) | 40–100 |
| Redis | 10–20 |
| R2 storage + egress | 5–15 |
| Analytics (self-hosted) + Sentry | 0–70 |
| LLM tokens (BGE self-hosted: compute only) | 20–80 |
| WeCom 会话存档 licenses (per seat/yr, amortized; verify pricing) | varies |
| **Total excl. WeCom license** | **~155–435** |

Upgrade triggers: A2 (OpenSearch) if top-N quality or latency fails eval; A3 (embeddings) if semantic misses dominate error review; logo scoring on demand (no storage — TSDR image fetch).

---

## 9. Explicit non-goals (architecture)

- No personal-WeChat/protocol automation; no QQ bots (ToS risk).
- No scraping of USPTO surfaces; official bulk/API only.
- No mainland hosting/ICP (deferred); no `.cn`.
- No Python services; no Rust/WASM (D-12/D-14).
- No unattended auto-filing; attorney always signs.
