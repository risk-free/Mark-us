# Schedule — Phases, Subphases, Milestones (man-days)

*Created: 2026-09-26 | Companion to PRD v2.0 | Style: Waterfall phase gates + continuous CI/CD within phases (D-08)*

**Conventions**
- **1 man-day (md) = 8h**, effort estimate **±20%**, includes code review + tests, excludes content authoring & legal consulting (business side).
- **Engineering total ≈ 262 md.** Supporting roles spread across phases: PM ≈ 15 md · UI/UX ≈ 10 md · QA ≈ 20 md · Trademark-attorney consult ≈ 8 md → **all-hands ≈ 320 md**.
- **No contractual deadline** (self-use product). Calendar @ 3 devs ≈ 18–20 weeks; @ 4 devs ≈ 15–17 weeks; @ 2 devs ≈ 28–32 weeks.
- Team profiles available: Architect, PM, Frontend, Backend, UI/UX, QA (5+ yrs each). DevOps/cloud capability assumed within backend/architect (flagged per subphase below).

---

## Phase table

| ID | Subphase | Key deliverable / milestone | md | Required IT background |
|---|---|---|---|---|
| **P0** | **Foundation & DevOps** | **Gate M0** | **18** | |
| 0.1 | Architecture baseline, ADRs, PRD v2, data model | Data model signed off | 4 | System architect (5+ yrs, security-aware) |
| 0.2 | Monorepo, TS/lint/test standards | Empty app builds + tests green | 4 | Senior backend (Node 20/TS) |
| 0.3 | CI/CD (GitHub Actions), Docker, IaC, staging/prod | **M0: pipeline deploys green to staging** | 6 | **DevOps/cloud** (Docker, Actions, Cloudflare/AWS HK, secrets/KMS) |
| 0.4 | Observability: Sentry, PostHog/Umami, uptime, cost dashboards | Alerts firing on test faults | 4 | DevOps + backend |
| **P1** | **Marketing Website** | **Gate M1** | **30** | |
| 1.1 | UI/UX design system + components | Design tokens approved | 6 | UI/UX + frontend |
| 1.2 | Core pages (home/about/services/cases/blog) | Page set complete | 8 | Senior frontend (Next.js App Router, Tailwind) |
| 1.3 | i18n zh-CN default / en / zh-TW + IP detection | 3 locales switchable | 4 | Frontend (next-intl) |
| 1.4 | SEO/GEO: meta, structured data, sitemap, blog CMS | Lighthouse SEO ≥90 | 6 | Frontend + SEO/GEO specialist |
| 1.5 | Content load, perf <3s, a11y pass | **M1: site live on prod domain** | 6 | Frontend + QA |
| **P2** | **Client Portal (magic-link)** | **Gate M2** | **42** | |
| 2.1 | Staff auth, RBAC (middleware + API), magic-link sessions | Auth matrix test pass | 8 | Backend + security (JWT/token design) |
| 2.2 | Contact/Case data model + migrations | Schema migrated on staging | 5 | Backend (Prisma/Postgres) |
| 2.3 | Document upload: presigned R2/S3, versioning, encryption | Upload + version history works | 8 | Backend (object storage, crypto at rest) |
| 2.4 | OCR + proofreading jobs (BullMQ) | zh/en OCR ≥90% usable | 7 | Backend (queues; PaddleOCR/LanguageTool) |
| 2.5 | Status dashboard + notifications | Status updates render | 5 | Full-stack |
| 2.6 | Portal UX, locales, QA cycle | **M2: E2E — provision → magic link → upload → OCR → status** | 9 | Frontend + QA |
| **P3** | **WeCom Lead Operations** | **Gate M3** | **30** | |
| 3.1 | WeCom enterprise cert, 会话存档 license, API credentials | Vendor onboarding done (business + PM) | 3 | PM + backend (Tencent onboarding) |
| 3.2 | 微信客服 callbacks, session lifecycle, waiting queue | Inbound WeChat chat received | 8 | Backend (China-platform APIs, callbacks, IP allowlist) |
| 3.3 | 客户联系 sync: external contacts ↔ Contact, tags | Contacts appear in CRM | 7 | Backend (ETL/sync) |
| 3.4 | 会话存档 ingest → ChatLog/Message + consent records + supervision view | Archived, searchable, consented | 7 | Backend + frontend |
| 3.5 | Tagging/filter + round-robin assignment + director override | **M3: lead → auto-assign ≤5 min → archived** | 5 | Full-stack |
| **P4** | **Payments** | **Gate M4** | **18** | |
| 4.1 | Order/Invoice/line-items + itemized invoice PDF (zh/en) | Invoice renders from line items | 5 | Backend |
| 4.2 | Stripe: checkout/payment links, idempotent webhooks, refunds | Test charges/refunds pass | 6 | Backend (Stripe integration, PCI scope) |
| 4.3 | USD base + CNY display, reconciliation jobs | FX display + ledger match | 4 | Backend |
| 4.4 | PayPal + per-rail runbook | **M4: real transaction per rail + invoice verified** | 3 | Backend |
| **P5** | **AI Probability Tool** *(critical path — start 5.1 in Wave 1)* | **Gate M5a** | **45** | |
| 5.1 | Spike: snapshot size, cohort base rate, label plan | Metrics pinned (D-03) | 3 | Data/ML |
| 5.2 | Daily XML ingest → Postgres live-only index (A1) + backfill | Freshness ≤24h, backfilled | 8 | Data/backend (ETL) |
| 5.3 | Similarity engine v1: pg_trgm + phonetic + class adjacency | Top-N conflicts <1s | 8 | Backend (search) |
| 5.4 | Scoring model + temporal holdout eval + attorney spot-check | **AUC ≥0.70, ≥+10pp over baseline** | 10 | **ML/eval** (calibration, AUC) + attorney |
| 5.5 | Suggestion engine (LLM gateway) + disclaimers (3 locales) | Disclaimers on every result | 6 | Backend + legal review |
| 5.6 | 24h result cache, public API, surfaces, monitoring | Score <10s p95 | 5 | Full-stack |
| 5.7 | OA-reason labeling (TSDR sample + LLM + QA) | Labeled 5–10K OA set | 5 | Data + attorney |
| **P6** | **LLM Gateway & Chatbot** | **Gate M5b** | **24** | |
| 6.1 | Gateway abstraction, fallback, cost/latency metrics | Model swap in <1h | 6 | Backend (China LLM APIs) |
| 6.2 | USPTO KB + RAG + zh/en prompts | Answers cite KB | 7 | AI/LLM (RAG) |
| 6.3 | WeCom bot wiring, human escalation, deflection metrics | Bot → human handoff <1 min | 6 | Backend |
| 6.4 | Eval harness + prompt regression in CI | **M5b: deflection ≥60%, zero-PII rule verified** | 5 | QA + AI |
| **P7** | **ERP Dashboard** | **Gate M6** | **35** | |
| 7.1 | Master-admin user/staff management + RBAC | Staff lifecycle works | 5 | Full-stack |
| 7.2 | Marketing budget allocation (campaign/channel) | Budget set + tracked | 6 | Full-stack |
| 7.3 | Pipeline Kanban/funnel + salesperson metrics | Live pipeline view | 8 | Full-stack (charts/SQL) |
| 7.4 | After-sale case tracking + SLA timers | SLA breach alerts | 7 | Full-stack |
| 7.5 | CS/complaint tickets + resolution/satisfaction | Ticket lifecycle works | 6 | Full-stack |
| 7.6 | Reporting + exports | **M6: director operates ERP end-to-end** | 3 | Backend |
| **P8** | **Hardening & Release** | **Gate M7** | **20** | |
| 8.1 | Security review: RBAC matrix, vault audit, dependency scan | No critical findings | 5 | Security-minded backend |
| 8.2 | Load test vs right-sized NFRs (100 concurrent) | NFR report signed | 4 | QA + DevOps |
| 8.3 | E2E regression (Playwright) all roles × locales | Suite green in CI | 6 | QA (automation) |
| 8.4 | UAT: one real case, attorney + client | **M7: production release signed off** | 3 | All |
| 8.5 | Runbooks, backup/DR drill, handover docs | Ops handover complete | 2 | DevOps |
| | **TOTAL (engineering)** | | **262** | |

---

## Milestone gates (Go / No-Go)

| Gate | Criteria | Exit authority |
|---|---|---|
| **M0** | CI/CD deploys green to staging; monitoring + alerts live; data model signed off | Architect |
| **M1** | Site live on prod domain; 3 locales; Lighthouse SEO ≥90, perf ≥90 | PM + Frontend lead |
| **M2** | E2E: staff provisions contact → magic link → upload → OCR → status view | PM + QA |
| **M3** | Live WeChat lead auto-assigned ≤5 min; archive visible + consented | PM + QA |
| **M4** | Real transaction per rail; itemized invoice correct; webhook replay safe | Finance + Backend |
| **M5a** | Probability: AUC ≥0.70, accuracy ≥ baseline +10pp, calibration ±10pp; disclaimers live | Architect + Attorney |
| **M5b** | Bot deflection ≥60%; escalation <1 min; PII-zero rule verified | PM + QA |
| **M6** | Master Admin runs ERP end-to-end (budget, pipeline, SLA, tickets) | Managing Director |
| **M7** | Security review clean; NFR report signed; UAT one real case passed | All leads |

---

## Execution model

**Waves (parallel tracks):**
```
Wave 1 (after M0):  P1 website  ‖  P2 portal  ‖  P3.1–3.2 WeCom setup  ‖  P5.1–5.2 spike+ingest
Wave 2:             P4 payments  ‖  P5 (5.3–5.7 remainder)
Wave 3:             P6 LLM/chatbot  ‖  P7 ERP
Wave 4:             P8 hardening (sequential) → M7 release
```

- **Critical path:** P0 → P5 (spike + eval iterations) and P3 vendor lead time (WeCom cert/license — start 3.1 immediately after M0, business-side).
- **CI/CD per-subphase DoD:** PR → lint/type/unit/integration green → auto staging deploy → phase-gate demo (Go/No-Go) → flag-gated prod release. Feature flags decouple phases deployed out of order.
- **Resource monitoring from M0:** dashboards for uptime, API latency p95, error rate, queue depth, DB/CPU/mem, integration health (WeCom/TSDR/Stripe/LLM probes), per-module cost.

## Business-side prerequisites (non-code)

| Item | Owner | Blocks |
|---|---|---|
| WeCom enterprise cert + 会话存档 license (verify pricing — tiers changed late 2025) | PM | P3 |
| Stripe HK account + KYC (HK entity docs) | Finance | P4 |
| PayPal business account | Finance | P4 |
| `.com` domain purchase | Ops | P1 |
| Firm USPTO.gov account + TSDR API key + ODP profile fields | Attorneys | P5 |
| Attorney availability for OA spot-checks (~8 md) | Legal | P5 |
| zh/en marketing content | Business | P1 |
| PRC counsel PIPL posture confirmation | Legal | P2 |
