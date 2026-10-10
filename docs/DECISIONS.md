# Decision Log (ADR-style)

*Created: 2026-09-26 | Companion to PRD v2.0 | Status: Accepted*

Architecture review of PRD v1.0 produced 14 flagged items. Each was discussed and decided as below. This is the authoritative rationale source; PRD v2.0 and ARCHITECTURE.md reflect these decisions.

---

## D-01: USPTO accounts are firm-internal, per-attorney credential vault

**Flag:** PRD v1 implied the firm "provides USPTO accounts" — sounded like credential sharing with clients/external parties.

**Decision:** Our attorneys are PRC lawyers with dual qualification (e.g., California bar in good standing — USPTO eligibility requires active good standing in any US jurisdiction, not citizenship). Each attorney keeps **their own** USPTO.gov account. Accounts never leave the firm; clients never have accounts.

Platform implements a **credential vault**:
- Password stored per-attorney under their own user record, envelope-encrypted (per-user data key wrapped by KMS).
- Retrieval only when *that* attorney triggers an assisted login; Managing Director and clients can never view it (that would be sharing).
- **MFA/TOTP seed is never stored** — attorney types the authenticator code at each USPTO session (USPTO MFA: Okta authenticator app / security key; email-as-second-factor removed Nov 2025).
- Every retrieval logged in `AuditLog`.
- The attorney personally signs/authorizes every filing (37 CFR 2.193). No unattended auto-submit.
- One separate firm USPTO.gov account provisions the **TSDR/ODP API key** for data access (official, rate-limited).

## D-02: No TESS scraping — official bulk data + local index (Option A, lean)

**Flag:** §3.6.2 specified TESS scraping (terms-of-service risk, TESS is retired, fragile).

**Decision:** TESS is gone (tmsearch.uspto.gov), no official similarity-search API exists. Use **Option A**: daily Trademark bulk XML download (~17 MB/day compressed) → parse → Postgres index.

- **Corpus = LIVE only = pending + registered** (status 600s + 700s). Dead marks can't be cited under §2(d), excluding them is legally sound and saves ~55% storage.
- **A1 (lean, chosen)**: Postgres + `pg_trgm` + normalized/phonetic matching — ~15–25 GB, $30–60/mo.
- **A2** (OpenSearch) and **A3** (embeddings, BGE, ~$0.50 one-time API + 5–15 GB) documented as quality-triggered upgrades — not built now.
- Status checks use the official **TSDR API** (API key). ODP requires USPTO.gov sign-in + MFA (since 2026-06-18).
- Word marks only in Phase 5; **logo/image scoring deferred** (design search codes available in text data; image files fetched on demand later).

## D-03: Probability score — defined target, defensible metrics, disclaimers

**Flag:** ">80% accuracy vs actual USPTO outcome" was undefined, inconsistent with M2 (70%), and unmeasurable.

**Decision:**
- **One headline score**: P(eventual registration) for mark+class+goods. Sub-signals (top conflicts, class-fit, descriptiveness flags) are non-probabilistic and feed suggestions.
- **Ground truth**: decided cohort (filings 2021–2023, registered vs abandoned; still-pending excluded as right-censored), labels from bulk status codes; office-action reasons via TSDR sample (5–10K) LLM-classified with attorney spot-check.
- **M2 gate**: AUC-ROC ≥ 0.70 on temporal hold-out AND accuracy ≥ 70% AND ≥ +10pp over majority baseline; calibration ±10pp within 20-pp buckets. §1.3's ">80%" demoted to Phase-3 stretch.
- Similarity features computed against *current* corpus (documented limitation).
- **Mandatory disclaimers** on every result (zh-CN/en/zh-TW): not legal advice, not a guarantee, examiner discretion, attorney review available. No accuracy claims in marketing until validated.
- Phase 1 keeps manual (attorney) assessment — no model.

## D-04: HK entity, HK region, PIPL not GDPR, China-based LLM

**Flag:** §6 said GDPR + ".cn compliance" + Vercel — conflicting for a mainland-China user base.

**Decision:**
- Operating entity = **Hong Kong**; hosting = **single HK region**; `.com` domain; **`.cn`/ICP deferred** out of scope for now.
- GDPR → **PIPL** wording (consent-based collection, PIPL privacy policy); PRC counsel to confirm cross-border posture (data collected directly by HK entity). Golden rule: **no client PII to third parties**.
- Marketing site may stay on Vercel; API/DB on HK infra; swap Vercel → Cloudflare if mainland access is flaky.
- **LLM**: China-based models via an **OpenAI-compatible gateway abstraction** (model-per-task, swappable): chat/lead-qual → DeepSeek/GLM; EN office-action classification → benchmark Kimi K3/DeepSeek/GLM in spike; **embeddings → self-hosted BGE** (open weight, no vendor dependency). Use providers' international/HK endpoints (avoid GFW dependency for HK→mainland calls).

## D-05: Payments — Stripe HK covers almost everything

**Flag:** §3.5 assumed separate Alipay/WeChat partner SDKs; PayMe/FPS are HK retail methods; "6 providers" gate.

**Decision:**
- **Phase 1: Stripe HK** — Visa/MC/Amex + Apple/Google Pay + **mainland Alipay + mainland WeChat Pay** in one integration (verified: HK accounts support both; WeChat direct-merchant model also available to HK entities but unnecessary).
- **Phase 2/3: + PayPal.** **PayMe/FPS dropped** (HK retail methods; HK segment pays by card). **UnionPay deferred** (needs separate acquirer; wallet coverage suffices).
- **HK wallets (AlipayHK / WeChat Pay HK) are separate products** — out of scope; upgrade path = Alipay+ gateway if HK/SEA segment grows.
- CNY is presentment/display only; settlement = HKD/USD to HK bank. **USD base pricing** + live CNY display.
- **Itemized invoices required** (platform service fee vs. USPTO government fees) → `Order`/`Invoice` + line-items in data model; refund logic per line.
- **M3 gate redefined**: Stripe (all rails) + PayPal live with **one real successful transaction per rail**.

## D-06: No registration anywhere; WeCom-based client operations

**Flag:** §2 (4 roles) vs §3.2.1 ("2 roles") contradiction; client "assigns salesperson" conflicted with management assignment.

**Decision (major pivot):**
- **No public registration, no client accounts.** Master Admin provisions all staff accounts. Clients are **`Contact` records**, not users.
- **Master Admin = Managing Director** (single role; the IT head).
- Salespersons operate from **WeCom (企业微信)**; clients stay on personal WeChat (invisible to them). Personal-WeChat supervision (wechaty/protocol bots) violates WeChat ToS → **out of scope, will not build**. QQ supervision has no official API → out of scope.
- **Channels (both)**: 微信客服 (WeChat Customer Service) = inbound lead queue with official session/assignment/chat-log APIs (this replaces the §3.3 website chatbox as primary channel; website widget optional for EN/overseas visitors) + 客户联系 (friend-add) for assigned ongoing clients + **会话存档** (Conversation Archive API) over both for supervision/PIPL-compliant archiving (built-in dual-side consent notice).
- **Assignment**: automatic round-robin → director override/reassign. Clients never choose salespeople.
- **Client portal survives via magic links**: staff creates Contact → secure one-time link (WeChat/email) → token session for document upload, payment, status — zero registration forms.
- Staff route groups: `/portal` (contact magic-link), `/expert`, `/crm`, `/admin` — single app, RBAC enforced in middleware **and** API layer.

## D-07: Metrics rewritten as a measurable funnel

**Flag:** ">30% conversion", "1000+ concurrent", "<2% payment abandonment" unrealistic or unmeasurable.

**Decision:** §1.3 rewritten:
- Visitor → WeChat contact **≥3%** (all visitors); chat-open → contact **≥30%** (engaged) — hypothesis, recalibrate after first 500 visitors; >500 visits/mo kept as floor.
- Bot **deflection rate** (closed without human + no re-ask ≤24h): ≥60% M2, ≥70% M3.
- New contact → tagged + assigned ≤5 min (median, business hours).
- Payment link opened → paid **≥70%**; webhook reconciliation 100%.
- Portal upload success ≥90%; NFRs right-sized to **100 concurrent / ~10k MAU** design load (API <500ms, USPTO jobs <10s unchanged).
- Analytics: **self-hosted PostHog or Umami + Sentry** (no Google Analytics — mainland access + PIPL).

## D-08: Schedule as man-days, Waterfall gates + CI/CD, no deadline

**Flag:** 24-week plan vs unknown team.

**Decision:** Product is **self-use, non-contractual — no deadline pressure**. Team = dedicated engineers (5+ yrs in architecture, PM, frontend, backend, UI/UX, QA), multiple devs in parallel. Deliverable = `docs/SCHEDULE.md`: P0–P8 phases/subphases with **man-day effort, required IT-background profiles, milestone gates (M0–M7)**, Wave-based parallelization, per-subphase CI/CD Definition-of-Done. Engineering ≈ **262 man-days** (±20%), all-hands ≈ 320 md; ≈18–20 calendar weeks at 3 devs.

## D-09: Data model — six new core entities

**Flag:** §5 lacked Document/Order/Conversation/Notification/Audit entities.

**Decision — add:** `Contact` (unauthenticated client), `Document` + `DocumentVersion`, `Order`/`Invoice` + `InvoiceLineItem`, `Conversation` + `Message` (WeCom sync, replaces bare ChatLog), `Notification`, `AuditLog`, plus `ConsentRecord` (PIPL/会话存档) and `WeComLink` (external_userid ↔ Contact). Keep User (staff), Trademark, Application, Payment, Lead/Tag, CS Ticket. Full schema in `packages/db/prisma/schema.prisma`.

## D-10: OCR/proofreading moved into Phase 2

**Flag:** v1 put OCR in Phase 3 while onboarding workflow depends on it.

**Decision:** OCR + proofreading jobs ship with the portal (P2 in SCHEDULE.md), not deferred.

## D-11: next-intl, not next-i18next; Next.js 15+

**Flag:** next-i18next is Pages-Router-only; "Next.js 14" dated.

**Decision:** Next.js 15+ App Router + **next-intl** (zh-CN default, en, zh-TW), IP-based detection + preference persistence.

## D-12: One TypeScript stack

**Flag:** PRD offered Hono/Node *or* FastAPI/Python while mixing Prisma/NextAuth/BullMQ (Node) with pytest (Python); React Query + SWR both listed.

**Decision:** Single TS monorepo — Next.js (web) + **Hono** (API), Prisma/Postgres, BullMQ+Redis, **React Query only** (SWR dropped), Jest + React Testing Library + Playwright (pytest dropped).

## D-13: OCR/proofreading tooling

**Flag:** Tesseract weak for Simplified Chinese; Hunspell is not a Chinese spellchecker.

**Decision:** **PaddleOCR (or cloud OCR) for zh** background jobs; **LanguageTool** for EN/spelling/punctuation; deeper rewrite suggestions via LLM gateway. BullQueue-processed, never blocking upload.

## D-14: Rust/WASM dropped

**Flag:** §7.6 optional Rust integration.

**Decision:** Nothing in scope justifies it. Dropped from all phases; revisit only with a proven hotspot.

## D-15: No always-on self-hosted service

**Status:** ACCEPTED — 2026-09-27 (D-15 amendment `2f4862d`)
**Owner:** ARCH
**Impact:** all phases; mandate M12.8

**Flag:** The team can operate this system but is not staffed for 24/7 maintenance. Every always-on
daemon we run ourselves - metrics stack, analytics product, model server - turns into a patching,
backup and paging obligation with nobody rostered to own it, which is exactly the work a managed
provider takes on.

**Decision:** The runtime footprint is the three deployable artifacts (`web`, `api`, `worker`) plus
managed services. A fourth always-on service may not be introduced without an ADR (mandate M12.8).
Three consequences follow:

| Concern | Was | Now |
|---|---|---|
| Product analytics | self-hosted PostHog | First-party beacon (`ARCH-03`, `/analytics/events`) written into Postgres; funnels and retention are read from that table. D-07 is unchanged - still no third-party analytics. |
| Search embeddings | Self-hosted BGE | Managed OpenAI-compatible API serving a BGE-family model. The query and its trigram candidate set are embedded on demand per request; no embedding is persisted, so there is no vector index, model server or nightly embedding job to operate. |
| Metrics and alerting | Self-hosted Prometheus + Grafana | Managed Prometheus-compatible metrics and alerting scraping `/metrics`, which keeps the Prometheus text format so the scraper itself stays swappable. |

**Constraints:** the embedding API sits in the same residency class as the LLM gateway (D-04, PIPL)
and receives mark text and class only, never client PII (rule G3). Its outage degrades `/tm/search`
to `method: trigram` rather than failing it (M6.4), so the candidate window and re-rank budget must
fit inside the 2 s p95 envelope of M7.4. Corpus-wide vector search would mean persisted embeddings,
a vector index and a migration, and therefore needs a new ADR before anyone writes it.

**Refs:** `docs/architecture/01-system-design.md` §4, §10; `docs/architecture/04-implementation-mandates.md` M6.4, M7.4, M12.8.

---

## D-16: Do not range-partition `AuditLog` in the hot table
**ID:** D-16
**Status:** ACCEPTED
**Date:** 2026-09-29
**Owner:** ARCH + DEV
**Impact:** P7, M11.3, M11.4

### Context
`ARCH-02` §6 required monthly RANGE partitioning of `AuditLog` on `createdAt`. Postgres requires the partition key in every unique key, so partitioned `AuditLog` would need `PRIMARY KEY (id, createdAt)`. Prisma models single-field `@id` only and `ARCH-02` §7.1 requires Prisma as the only schema authority. 

### Decision
Keep the single-field `@id`; do **not** hot-table RANGE-partition `AuditLog` or `Message`. Use BRIN on `createdAt`, tune autovacuum (`autovacuum_vacuum_scale_factor = 0.02`, `analyze_scale_factor = 0.01`), and maintain the Q17 partial index. Archive closed months to R2 (Parquet) at 24 months, verify manifests (row count + checksum), and delete old hot rows in 1 000-row batches. `M11.4` audit export spans hot + archive as one ordered stream.

### Rationale
- Export/read requirement already crosses archives in either case; no load-bearing plan benefit for the declared access paths.
- Avoids composite PK, `$queryRaw` audit writer, or hand-written lifecycle outside `prisma migrate`.
- Matches the stated compliance target (5-year retrievability) without violating the "Prisma is the only schema authority" constraint.

### Consequences
- `ARCH-02` §6, §4.1 Q15, §8 Q15 updated; M11.4 updated.
- Partition maintenance job in `worker` replaces "create partitions" with "archive + batch delete".
- If query/export performance degrades, re-partition only via a new ADR (D-19+).

---

## D-17: Accept the P0.3 migration as a baseline, not a delta
**ID:** D-17
**Status:** ACCEPTED
**Date:** 2026-09-29
**Owner:** ARCH + DEV
**Impact:** P0.3, M3.2, M3.3

### Context
`ARCH-02` §5 describes the P0.3 deliverable in delta language ("adds" models and columns) and §5.4
supplies `ALTER COLUMN … TYPE timestamptz(3)` statements that only make sense against pre-existing
tables. In fact `packages/db/prisma/` held only `schema.prisma`: there was no `migrations/`
directory and no applied history, so there was nothing for a delta to be a delta *against* — the P0
v1 schema had never been materialised in a database.

### Decision
`packages/db/prisma/migrations/0P3__p0_3_backlog/` is a **baseline**. The deploy path is
`prisma migrate deploy` against an **empty** database; it must never be applied to a populated one;
reversal is restore-from-backup. The SQL is *generated* from `schema.prisma` plus
`migrations/0P3__p0_3_backlog/fragments/*.sql` (its own header names both inputs), so
`schema.prisma` stays the sole schema authority and the SQL stays a build artifact — no hand-editing.
§5.4's `ALTER COLUMN … TYPE timestamptz(3)` statements are **void** (every instant is already
`timestamptz(3)` from creation), though the §5.4 *acceptance test* still runs as a test. The next
migration is a genuine delta against this baseline and is named per `ARCH-02` §7.2.

### Rationale
- "Zero drift" is `ARCH-02` §7.6 — apply the migrations to a fresh database and assert
  `prisma migrate diff` from `schema.prisma` is empty. That test cannot distinguish a baseline from a
  delta, and a baseline satisfies M3.2's verification exactly.
- Manufacturing `0P0__baseline` + a delta would produce a *fake upgrade path* a later reviewer would
  read as real; §7.2 already allows the honest alternative (an "irreversible, restore-from-backup"
  note).

### Consequences
- `packages/db/prisma/migrations/0P3__p0_3_backlog/` committed with its source `schema.prisma`
  (`bd1cb58`), so a clean clone reproduces the baseline and `pnpm db:drift` can pass.
- Documented in `docs/runbooks/db-migrations.md` §3.

---

## D-18: Magic-link tokens are stored in Postgres, not Redis
**ID:** D-18
**Status:** ACCEPTED
**Date:** 2026-09-29
**Owner:** ARCH + DEV
**Impact:** `ARCH-01` §5.1/§5.2, M4.x auth

### Context
`ARCH-01` §5.2 places the live client magic-link token in Redis at `ml:<sha256(token)>` with a
900 s TTL. The shipped schema instead defines a `MagicLinkToken` table (`tokenHash`, `expiresAt`,
`consumedAt`, `attempts`, `scope` default `portal`, `requestIp`/`requestUa`) as the live credential.

### Decision
**Postgres wins.** The `MagicLinkToken` table is the live credential store. `ARCH-01` §5.2 is
amended in the same change (Redis is no longer the credential store for magic links). The token is
opaque, `≥ 20 bytes`, single-use, stored only as `tokenHash`, never logged or echoed, destroyed
after 5 wrong attempts, and expires at `now + 15 min`. `scope` is `portal` only today; adding
`pay:<invoiceId>` is an authz-surface change requiring an ADR and a contract change first.

### Rationale
- Atomic single-use via `UPDATE … WHERE consumedAt IS NULL`.
- A forensic record of issue and redemption.
- Room for the `pay:<invoiceId>` scope the column comment already anticipates.

### Consequences
- Expired/consumed rows need a sweep job in `worker` (there is already an `@@index([expiresAt])`).
- Rate limits unchanged: `5/1h` per contact, `20/1h` per IP, `10/15min` per token; `202` neutral.

---

## Business-side prerequisites (non-code, start immediately)

| Item | Owner | Blocks |
|---|---|---|
| WeCom enterprise certification + 会话存档 license (verify current pricing, tiers changed late 2025) | PM | P3 |
| Stripe HK account + KYC (HK entity docs) | Finance | P4 |
| PayPal business account | Finance | P4 |
| Domain purchase (`.com`) | Ops | P1 |
| Firm USPTO.gov account + TSDR API key | Attorneys | P5 |
| ODP profile fields complete (4 fields req. since 2026-08-18) | Attorneys | P5 |
| Attorney availability for OA spot-checks (~8 md) | Legal | P5 |
| zh/en marketing content authoring | Business | P1 |
| PRC counsel PIPL posture confirmation | Legal | P2 |
