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

## D-19: Accepted-risk register for two unpatchable dev-only advisories
**ID:** D-19
**Status:** PROPOSED — awaiting Architect ratification
**Date:** 2026-09-29
**Owner:** ARCH + DEV
**Impact:** P0.3 supply-chain gate (M12.3, G9)

### Context
The remediation pass for FA-008 cleared 12 of 14 advisories (2 critical → 0, 6 high → 1, 6 moderate → 1). Two remain and **neither has a fixed release upstream** — `pnpm audit` reports `patched_versions: "<0.0.0"` for both, and both are GHSA-only with no CVE:

| Advisory | Package | Severity | Chain | Fixed? |
|---|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm | `braces@3.0.3` | high | `eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces` | no — 3.0.3 is both latest and vulnerable |
| GHSA-hp3w-g68c-fv3c | `sprintf-js@1.1.3` | moderate | `jest > @jest/reporters > babel-plugin-istanbul > @istanbuljs/load-nyc-config > js-yaml@3 > argparse@1 > sprintf-js` | no — 1.1.3 is both latest and vulnerable |

`micromatch@4.0.8` is the latest micromatch and depends on `braces ^3.0.2`; every `fast-glob` version depends on `micromatch`. The only way to delete `braces` from the tree is to drop `eslint-config-next`, which removes the Next lint layer agreed in DQ-004. Neither advisory is reachable from a runtime path: `braces` executes only inside `pnpm lint`, `sprintf-js` only inside Jest's coverage loader, and neither ships in the web standalone output, the api image or the worker image.

### Decision
1. Fix everything fixable now — done: `next` → `15.5.27`, `eslint-config-next` → `15.5.27`, lockfile refresh, and `pnpm.overrides` for `postcss@^8.5.29` (Next 15.5.27 still pins the vulnerable `8.4.31`), `deepmerge-ts@^8.0.0` (Prisma pins the vulnerable `7.1.5`) and `sprintf-js@^1.1.3`.
2. Accept the two residual advisories through a **committed, diffable, expiring registry** — `infra/supply-chain-exceptions.json` — enforced by `pnpm check:supply-chain`, not by a CI `--ignore` flag.
3. Do not downgrade the severity threshold. The gate is *stricter* than `pnpm audit --audit-level=high`: any advisory not in the registry fails the build at **any** severity, an expired `reviewBy` fails the build, and a stale entry that no longer reproduces prints a notice for removal.

**Why a registry file and not pnpm config.** pnpm 9.15 expresses exclusions through `auditConfig.ignoreCves`, which matches on **CVE ids**; both accepted advisories are GHSA-only, so the setting silently does nothing (verified: adding it left the audit reporting both). A JSON registry with a named owner and a review date is the reviewable form of the same decision, and it survives a pnpm major upgrade.

### Alternatives rejected
- `pnpm audit --audit-level=critical` — narrows the gate instead of fixing or explaining the residue.
- `--ignore` on the CI command — hides the finding from the audit output; invisible to review.
- Drop `eslint-config-next` — removes a lint layer for a build-time DoS in a dependency with no fix; disproportionate.
- Upgrade to Next 16 to reach a plugin that may drop `fast-glob` — a framework major for a dev-only advisory; D-20 territory when Next 16 is planned on its own merits.

### Consequences
- CI's `supply-chain` job runs `pnpm check:supply-chain`; the registry is explicit in the job env because a mirror without an audit endpoint reports zero vulnerabilities and would produce a false green.
- Both entries expire **2026-12-29**; the gate fails from that date until they are renewed or removed.
- Revisit when `braces`/`micromatch` or `sprintf-js` ships a fix, or when Jest drops the `js-yaml@3` / `argparse@1` chain.

---

## D-20: Identity model — natural person, organization, and a temporal many-to-many link
**ID:** D-20
**Status:** ACCEPTED
**Date:** 2026-10-11
**Owner:** ARCH
**Impact:** P0.3 schema backlog (`Contact`/`Company`/`ContactCompany`/`Trademark`), P3 WeCom intake (`M4.2`), CRM cross-sell (P7), API contract
**Source:** DQ-006 (owner ruling 2026-10-11)

### Context
`Contact` conflated two different things: the **human we talk to** and the **legal/business entity** that owns marks and pays invoices. The owner set the real-world model straight:
- We chat with **people**.
- One person can be tied to **several companies over time** (job changes) and to **several at once** (group/role).
- A **group** has **multiple subsidiary companies**.
- A **company** can own **multiple marks**; an **individual person** can also own a mark.
- Cross-sell runs **through a person** *and* **through a company/group**.

A single flat `Contact` cannot express any of that: it forces either duplicate people or duplicate companies, and it makes "who owns this mark / who is billed" ambiguous.

### Decision
1. **`Contact` = the natural person** (channel identity). Add `Contact.legalName String?` (the person's legal name — needed when an individual owns a mark). `Contact.name` stays the channel-facing display name.
2. **New `Company` = the legal entity/organization.** `name` (display), `legalName` (registered), `registrationNo String?` (统一社会信用代码 / company registration), `jurisdiction String?`, `companyType String?`, **`parentCompanyId String?`** (self-relation; a root with children *is* a group), `deletedAt`, timestamps.
3. **New `ContactCompany` = temporal many-to-many** between person and company: `contactId`, `companyId`, `role CompanyRole` (`LEGAL_REP|CONTACT|ATTORNEY|FINANCE|OTHER`), `title String?`, `startedAt?`, `endedAt?` (null = current), `isPrimary Boolean`. History is **kept**, not overwritten — a job change ends one row and starts another.
4. **`Trademark` owner becomes polymorphic**: add `Trademark.companyId String?`; `contactId` remains for an **individual** owner. A CHECK requires **exactly one** of (`contactId`, `companyId`) to be set. The person we deal with is reached via `ContactCompany` of the owning company, or directly for individual owners.
5. **Both cross-sell vectors are first-class:** person → `ContactCompany` → companies → `Company.parentCompanyId` tree → subsidiaries → their marks/orders; and the same traversal keyed by company/group.

### Alternatives rejected
- **Keep a text `Contact.company` field** — cannot model groups, temporal reassignment or M:N; duplicates return immediately.
- **Model a company as another `Contact` with a `type` flag** — overloads unique email/phone, assignment and PII rules; "assigned salesperson" is meaningless for a shell company.
- **Separate `CompanyGroup` entity** — a group is just a root `Company`; a separate table adds a join for no behavioural difference. Revisit only if a group ever needs its own billing/identity.

### Consequences
- New models/columns land in the **P0.3 backlog migration before P3 (`M4.2`)**, so WeCom intake links against the right entity from the start — no backfill. Because `0P3__p0_3_backlog` has **not** been applied to any populated database (ADR D-17), these models extend that baseline migration; if it has already been applied to the staging DB, a single follow-up `expand` migration is written instead (never an in-place destructive edit).
- Module ownership: `crm` owns `Company` and `ContactCompany` (see `ARCH-01` §2.2).
- API contract gains `Company` resources and contact↔company link endpoints (follow-up mandate).
- Cross-sell analytics (D-07 funnel, P7) gain a company/group dimension.
- PII: `Contact.legalName` is Direct PII; `Company.legalName`/`registrationNo` are business registry data (not personal PII).

---

## D-21: Contact merge is never automatic — Master-Admin, audited, via a candidate queue
**ID:** D-21
**Status:** ACCEPTED
**Date:** 2026-10-11
**Owner:** ARCH
**Impact:** P0.3 schema backlog (`ContactMergeCandidate`, `Contact.mergedIntoId`), CRM RBAC, `M4.2`
**Source:** DQ-006 (owner ruling 2026-10-11)

### Context
Same fragments as D-20: a client arriving on one channel and continuing on another produces duplicate `Contact` rows that split orders, invoices and document history. Merge is a destructive, audit-relevant action on an entity that bears invoices and powers of attorney.

### Decision (owner chose Option A)
1. **Detection never mutates.** Create a `ContactMergeCandidate` row: `primaryContactId`, `matchedContactId`, `reason ContactMergeReason` (`WECOM_ID|EMAIL|PHONE|MANUAL`), `score Float?`, `status` (`PENDING|MERGED|DISMISSED`), `reviewedById?`, `reviewedAt?`. Match order: `WeComLink.externalUserId` → normalised `email` → normalised `phone`.
2. **Merge is an explicit `MASTER_ADMIN`-only, audited operation.** Reassign every FK edge (orders, invoices, payments, documents, conversations, messages, trademarks, leads, tickets, consent records, notifications, magic-link tokens, WeCom links, contact↔company links) to the surviving `Contact`; set the loser's `Contact.mergedIntoId` **and** `deletedAt`; write an `AuditLog` entry. The loser is **never hard-deleted** — it remains a pseudonymous stub.
3. Add `Contact.mergedIntoId String?` (self-relation).
4. **No auto-merge at any tier.** Company merge is out of scope for now (future ADR) — only person/`Contact` merge ships.

### Alternatives rejected
- **Auto-merge with audit (B)** — a silent cross-channel identity merge on an entity carrying invoices is unacceptable; a wrong merge corrupts financial history.
- **Salesperson confirms (C)** — the operator who benefits from a clean CRM is not the authority who should bear the audit risk; Master-Admin is.

### Consequences
- New migration items (`ContactMergeCandidate`, `Contact.mergedIntoId`) join the P0.3 backlog.
- A `MASTER_ADMIN` RBAC grant plus a merge mandate with a hard verification (no orphan FK / no lost financial edge after merge).
- `ContactMergeCandidate` rows are retained as evidence after resolution.

---

## D-22: Refund policy — filing-stage cut-offs, two-step authority, approval threshold
**ID:** D-22
**Status:** ACCEPTED
**Date:** 2026-10-11
**Owner:** ARCH (+ Business)
**Impact:** P4 commerce (`M10.3`), `Refund`/`RefundAllocation`, RBAC (`order.refund.request`), `03-api-contract.yaml`, OPEN-07
**Source:** DQ-009 (owner ruling 2026-10-11)

### Context
`order.refund` is `MASTER_ADMIN`-only and `InvoiceLineItem.refundable` defaults `true` for every `kind`, but there was no written refund policy and no decision on the USPTO-fee cut-off. Stripe/PayPal refunds are issued against a *charge*, not a line item, so per-line refunds produce multiple provider refund objects the ledger must represent.

### Decision (owner chose Option A)
1. **Policy-driven refundability**, derived from `LineKind` + order/filing state and encoded in a `refundPolicy` module (mirrors the `retention` module) with unit tests. `InvoiceLineItem.refundable` is a **snapshot flag**; the authoritative decision is recomputed at refund time.
   - **`USPTO_FEE`** — refundable **until the filing is recorded** (`Application.serialNumber` set / `recordFilingReceipt`); **non-refundable** after (the government fee is spent).
   - **`SERVICE_FEE`** — refundable **until the application is filed**; after filing, `MASTER_ADMIN` discretionary with a recorded reason.
   - **`OTHER`** — discretionary, default refundable.
2. **Two-step authority** (segregation of duties): **request** by any staff holding **`order.refund.request`** (a `Refund` is created `PENDING` with `requestedById` + reason); **approve + execute** by **`order.refund`** (`MASTER_ADMIN`), which issues the provider refund and flips the row to `SUCCEEDED`. Every step is audited (`REFUND_REQUESTED`, `REFUND_ISSUED`).
3. **Threshold.** Refunds above the configured threshold require a **second, distinct** `MASTER_ADMIN` approver (`approvedById ≠ requestedById` and `≠` the executing admin). **Initial value = USD 200**, held in configuration, not code; changing it needs no migration. **Closes OPEN-07.**
4. Refunds are new `Refund` rows + one `RefundAllocation` per line + an `Order.status` transition; history is never mutated. The sum of allocations per line may not exceed the line's refundable remainder.
5. `Refund.providerRefundId` is the reconciliation key for the daily job (`M10.5`).

### Alternatives rejected
- **B — manual via provider dashboard** — no ledger; `M10.5` ("reconciliation success 100%") cannot be evidenced for partial refunds.
- **C — automatic on cancellation** — would auto-refund government fees already spent, and leaves no approval trail.

### Consequences
- New `refundPolicy` module + RBAC permission **`order.refund.request`** (contract vocabulary must declare it — see OPEN-11).
- Schema delta: `Refund.status` (uses the contract `RefundStatus`) and `Refund.requestedById` — folded into the P4 contract/schema follow-up (OPEN-11).
- `M10.3` amended with the cut-off rules and tests; `03-api-contract.yaml` `/orders/{orderId}/refund` semantics updated.
- OPEN-07 **RESOLVED** (USD 200, configurable).

---

## D-23: Pipeline and sales metrics — derive stage distribution, materialise period metrics
**ID:** D-23
**Status:** ACCEPTED
**Date:** 2026-10-11
**Owner:** ARCH
**Impact:** P7.3/P7.6 (`M11.2`), `ARCH-02` §4, PRD §5.11, `Campaign`
**Source:** DQ-003 (owner confirmed Option C, 2026-10-11)

### Context
PRD §5.11 promises `PipelineStage` and `SalesMetrics` entities, but the schema has only `Campaign`;
`LeadStage` + `Contact.stage` already exist, so pipeline data is derivable. No schema commitment was
made, and `M11.2` already requires `/crm/pipeline` and `/crm/funnel-metrics` to read from
pre-computed rollups rather than ad-hoc aggregation.

### Decision (owner chose Option C — hybrid)
1. **`PipelineStage` is not a table.** The stages are the existing `LeadStage` enum; stage
   distribution is a **derived** query (`GROUP BY stage` over `Contact`), served by the existing
   `contact (stage)` index (`ARCH-02` Q2). Always fresh, no ETL.
2. **`SalesMetrics` is materialised** as a period aggregate keyed by **(`period`, `salespersonId`)**
   (with an org-level roll-up via a null/flag salesperson), populated by a scheduled backfill job,
   carrying a `generatedAt` stamp and a **staleness alert**. The period grain (day vs month) is fixed
   at P7.3 kickoff.
3. **Budget tracking** (P7.2) reads `Campaign` + order lines; no new budget entity.
4. **Ownership of the aggregate table and the read index** (`period`, `salesperson_id`) are decided
   when the table lands in P7.3 — the index registers as a Q-row in `ARCH-02` §4.1 (reserved Q22) at
   that point, per the "no index without a query" rule.

### Alternatives rejected
- **A — derive everything.** Funnel/period metrics over the transactional tables would fail the
  `M11.2` p95 posture at production volume.
- **B — materialise everything.** A single indexed `GROUP BY` on `Contact.stage` gains nothing from
  materialisation and would add staleness risk to a value that must be exact.

### Consequences
- P7.3 is a pipeline-plus-backfill task, not a pure reporting query.
- `M11.2` amended: `/crm/pipeline` (stage distribution) derived and indexed; `/crm/funnel-metrics`
  and salesperson/period metrics served from rollups.

---

## D-24: Probability cohort and label horizon
**ID:** D-24
**Status:** ACCEPTED
**Date:** 2026-10-11
**Owner:** ARCH (+ Business)
**Impact:** P6 (`M6.1`, `M6.5`), `TmCorpusMark`, `pRegistration`, OPEN-03
**Source:** OPEN-03 (owner ruling 2026-10-11)

### Context
`M6.1` requires the headline `pRegistration` to mean `P(eventual registration)`, and `M6.5` requires a
calibration report per model version. Both need a defined **cohort** (which marks are in scope) and a
**label horizon** (how long we wait for the outcome before trusting it as a label). Until both are
fixed, `M6.1`'s halt keeps the field `PENDING-P6`.

### Decision (owner chose cohort B)
1. **Cohort = the whole LIVE USPTO corpus** (`TmCorpusMark`, `statusCode` 600 pending + 700
   registered). **No applicant-origin / nationality filter** — a USPTO mark is in scope regardless of
   the owner's residence or nationality, so origin is not a relevant discriminator.
2. **Label = eventual registration.** Positive = registered (`registrationDate` set / `statusCode`
   `700`); negative = abandoned (`abandonDate` set). Marks still `600` at the horizon are
   **censored** — excluded from the labelled set, not counted as negatives.
3. **Label horizon = configurable, initial `+6 months` from `filingDate`**, held in configuration, not
   code; extendable to `+9` or `+12` months as the corpus matures. Changing it needs no migration and
   no model-version bump by itself (it changes only cohort assembly). **Amended by ADR D-26
   (2026-10-12): horizon is now `+12 months` (primary) / `+24 months` (secondary) — see D-26.**

### Rationale
USPTO pendency commonly runs 8–14 months, so a short horizon yields a small and positively-biased
labelled set; a longer horizon buys more resolved outcomes at the cost of excluding recent filings and
slowing the retraining cadence. Because that trade-off will move as the corpus grows, the value must be
tunable without a deploy. Origin is irrelevant to registrability, so filtering by it would only shrink
the cohort without improving label quality.

### Consequences
- `M6.1` halt lifted for the `P(eventual registration)` description; the golden fixture set (≥ 50
  human-labelled marks) is drawn from the labelled cohort. Cohort/label assembly and the horizon
  parameter are owned by `M6.5`.
- No schema change: the corpus already carries `statusCode`, `filingDate`, `registrationDate`,
  `abandonDate`. Cohort assembly is a curation query, not a new table.
- OPEN-03 **RESOLVED**.

---

## D-25: Model release — minimum sample size and calibration confidence
**ID:** D-25
**Status:** ACCEPTED
**Date:** 2026-10-11
**Owner:** ARCH
**Impact:** P6 (`M6.5`, `M6.1`), `TmCorpusMark`, OPEN-08
**Source:** OPEN-08 (owner ruling 2026-10-11)

### Context
`M6.5` requires a per-model-version calibration report (reliability curve, sample size, confidence
interval) before the model may be released, and its verification refuses `RELEASED` without a report
"whose sample size meets the configured minimum" — but that minimum was never set. The labelled set is
now defined by ADR D-24 (whole LIVE corpus; label = eventual registration; resolved within the
configurable horizon; pending marks censored).

### Decision
A model may be released only when the calibration report, computed on the **temporally held-out
split**, satisfies **both**:
1. **≥ 500 resolved labels** in the calibration set; and
2. **95% CI half-width on overall accuracy ≤ 5 pp**.

Both thresholds are held in **configuration**, not code, and are re-checked at every promotion.

### Rationale
A bare count can still yield a wide confidence interval, so a sample-size floor alone does not make a
calibration defensible; pairing the count with a CI half-width gives a floor that tightens naturally as
the corpus grows and keeps the promotion gate meaningful. A temporal split (rather than random) mirrors
the M5a evaluation discipline and approximates the production condition where the model scores marks
filed after its training window.

### Consequences
- `M6.5` promotion gate enforces both conditions; `M6.1` reproducibility/replay set is unaffected.
- If the corpus cannot supply 500 resolved labels at the initial +6-month horizon, either the horizon is
  widened (D-24) or the model stays unreleased — the gate is not lowered to fit the data.
- OPEN-08 **RESOLVED**.

---

## D-26: Label horizon — amend D-24 to +12 months (primary), +24 months (secondary)
**ID:** D-26
**Status:** ACCEPTED
**Date:** 2026-10-12
**Owner:** ARCH (owner-approved 2026-10-12)
**Impact:** P5/P6 (`M6.1`, `M6.5`, `M7.1`), D-24 item 3, OPEN-03, P5.1
**Source:** P5.1 spike (`docs/architecture/05-p51-spike.md`)

### Context
D-24 fixed a configurable label horizon, initial `+6 months` from `filingDate`. The P5.1 spike
measured the actual resolution behaviour of the whole LIVE corpus (12,691,941 researcher case
files, 1870–2024-03): time filing→registration is **median 13.3 months**, with ≈ 1.7 % resolved by
+6 months, ≈ 40 % by +12, ≈ 85 % by +24. A +6-month horizon therefore labels a negligible,
positively biased slice (only the fastest registrations) and cannot support the D-25 gate.

### Decision
1. **Amends D-24 item 3.** The label horizon is **+12 months from `filingDate` (primary)** and
   **+24 months (secondary)**, held in configuration as before; no migration, no model-version bump
   by itself.
2. Labels are assembled per D-24 semantics: positive = registered (`registrationDate` set /
   `statusCode 700` within the horizon); negative = abandoned (verified abandon event within the
   horizon); still `600` at the horizon = **censored**, never a negative.
3. The abandonment signal for labels must come from the live TDXF event/status history (M7.1), not
   the research case-file status codes — the research table has no abandon-date column and the
   never-registered residue sits in stale `6xx` statuses (spike §3).

### Rationale
The measured curve: +12 gives ≈ 40 % resolved (enough mass around the median), +24 gives ≈ 85 %
(near-complete) at the cost of a longer label wait; two horizons let `M6.5` report on the primary
and audit on the secondary. The D-25 floor is easily met at +12: one month of word filings
(≈ 40–50 K marks) yields ≈ 13–17 K resolved labels; CI half-width at n = 500, p ≈ 0.6 ≈ 4.3 pp ≤ 5 pp
(spike §5).

### Consequences
- `M6.1` halt text, `M6.5` labelled-set text, `ARCH-01` §15 OPEN-03 and `ARCH` README OPEN-03 updated
  to reference D-26.
- `M7.1` ingest must retain event/status history so abandon labels can be resolved correctly
  (FA-011 access + feed are the gate).
- D-24 remains the authority for cohort and label semantics; D-26 supersedes only its horizon default.

---

## D-27: Test runner for apps/web — jest only, vitest removed
**ID:** D-27
**Status:** ACCEPTED
**Date:** 2026-10-17
**Owner:** ARCH (ruling 2026-10-17) / DEV (implementation)
**Impact:** P1 marketing website (`apps/web`), `pnpm test`, `pnpm check:supply-chain`
**Source:** supply-chain regression introduced during P1 work (see A0, Developer→Architect 0001)

### Context
apps/web used vitest (^3) as a second test runner alongside repo-wide jest (D-12 records "Jest + React Testing Library + Playwright"). vitest ^3 pulls tinypool (2 critical RCE advisories GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) plus vitest/@vitest/mocker (GHSA-82fw-gwwq-j7x9), failing `pnpm check:supply-chain` (6 unlisted advisories, 2 critical).

### Decision
1. Port the five apps/web suites (score, posts, locales, messages, site) to jest; delete vitest, vitest.config.ts and the vitest-format snapshot.
2. Add apps/web/jest.config.cjs extending @markus/config/jest.preset.cjs with `^@/(.*)$` → `<rootDir>/src/$1` and `^@markus/tm-data$` → `<rootDir>/../../packages/tm-data/src/index.ts`; ts-jest jsx override `react-jsx`; `resolveJsonModule: true`.
3. Set `apps/web` `"test": "jest"`; mirror jest devDeps (jest ^29.7.0, ts-jest ^29.4.14, @types/jest ^29.5.14).

### Rationale
One test runner repo-wide; removes 4 advisories and the dual-runner/dual-config burden in one move.

### Consequences
- `pnpm test` = `turbo run test` = jest; all 5 suites (67 tests) green, 18 snapshots regenerated with unchanged markup.
- `pnpm check:supply-chain` reports 0 unlisted advisories (CI is the authority; the dev host cannot reach the audit endpoint).

---

## D-28: next-intl version floor — ^4.14.9
**ID:** D-28
**Status:** ACCEPTED
**Date:** 2026-10-17
**Owner:** ARCH (ruling 2026-10-17)
**Impact:** P1 marketing website (`apps/web`), `pnpm check:supply-chain`
**Source:** supply-chain regression + Windows build workaround (Developer→Architect 0001)

### Context
next-intl was temporarily downgraded to 4.5.8 to work around a Windows-only @swc/core DACL failure (Debugger 0001 B3). 4.5.8 is below the fix boundary for GHSA-8f24-v5vv-gm5j (open redirect, fixed 4.9.1) and GHSA-4c35-wcg5-mm9h (precompile prototype pollution, fixed 4.9.2); 4.14.9 is clean on both.

### Decision
Revert next-intl to ^4.14.9.

### Rationale
The security floor takes precedence over a local-environment workaround; the @swc/core failure is environmental, not version-related.

### Consequences
- next-intl 4.14.9 requires @swc/core ~1.16.0; local Windows builds need a temporary local override that is never committed (see D-29).
- CI/Linux builds natively (no DACL check).

---

## D-29: No committed @swc/core override
**ID:** D-29
**Status:** ACCEPTED
**Date:** 2026-10-17
**Owner:** ARCH (ruling 2026-10-17)
**Impact:** `package.json` pnpm.overrides, local Windows build, `pnpm build`
**Source:** @swc/core@1.16.18 native-binding DACL rejection (Debugger 0001 B3)

### Context
@swc/core@1.16.18 refuses to load on the dev Windows host because C:\ and D:\ roots grant replacement rights to Everyone/Authenticated Users (non-default ACLs; account resolves as ANONYMOUS\franc). Forcing @swc/core to 1.15.7 via pnpm.overrides works locally but is below next-intl's ~1.16.0 contract and is a global, all-platform pin for one machine.

### Decision
Do NOT commit a @swc/core override. Keep it local-only and uncommitted for any local build verification; CI/Linux builds natively.

### Rationale
Avoid pinning a transitive dependency down a version repo-wide for a single environment defect.

### Consequences
- `next build` cannot run natively on this Windows host until the ACL defect is resolved; static-emission evidence was captured with a temporary local override, then reverted (29 prerendered HTML files, all SSG, zero dynamic routes).
- The ACL defect is tracked with the Debugger (0001 B3); fixing it removes the need for any override.

---

## D-30: CSP 'unsafe-inline' signed off for the marketing origin
**ID:** D-30
**Status:** ACCEPTED
**Date:** 2026-10-17
**Owner:** ARCH (ruling 2026-10-17)
**Impact:** `apps/web/next.config.mjs` CSP, P2 portal scope
**Source:** SSG nonce impossibility (Developer→Architect 0001)

### Context
SSG makes a per-request nonce impossible and hash-based CSP is brittle against Next's inline bootstrap. The marketing origin is static, unauthenticated, no-PII and third-party-script-free (D-07/M8.3 enforced).

### Decision
style-src 'unsafe-inline' approved; script-src 'unsafe-inline' approved for the marketing origin ONLY, and MUST be revisited before any authenticated surface (P2 portal) shares this origin.

### Rationale
No viable alternative for static HTML with Next's inline bootstrap; conditions limit blast radius.

### Consequences
- Record as D-30 with reviewBy at the P2 gate.
- Conditions: never dangerouslySetInnerHTML user text (/assess and /assistant render user mark text — keep it escaped); keep object-src 'none', base-uri 'self', frame-ancestors 'none'; keep 'unsafe-eval' dev-only.

---

## D-31: localePrefix "always" accepted
**ID:** D-31
**Status:** ACCEPTED
**Date:** 2026-10-17
**Owner:** ARCH (ruling 2026-10-17)
**Impact:** `apps/web/src/i18n/routing.ts`, `apps/web/src/middleware.ts`, SEO/canonical, CI smoke test
**Source:** locale-prefix routing (Developer→Architect 0001)

### Context
next-intl routing with localePrefix "always" makes `/` a 307 redirect to a concrete locale (detection order: prefix > cookie > IP > Accept-Language > zh-CN default).

### Decision
Accept "always"; a 307 (temporary) is the correct status because the target varies by cookie/IP — a 308 to a varying target would be wrong.

### Rationale
Prefix-always is the next-intl recommendation and keeps every locale URL canonical; the 307 honestly reflects a varying target.

### Consequences
- Each locale page self-canonicals to its prefixed URL; full hreflang incl. x-default; `/` excluded from the sitemap; sitemap enumerates all three locale roots.
- CI smoke probe uses `curl --location` and asserts the FINAL response is a 200 locale page, not merely that a redirect hop was followed.
- Outcome (2026-10-21): D-31 follow-up CLOSED — run 39469269982 (a4b9d3b) all green; compose-smoke web step echoed `web body 42905 B` against the 34000 floor (ci.yml:315), ~26% headroom.

---

## Business-side prerequisites (non-code, start immediately)

| Item | Owner | Blocks |
|---|---|---|
| WeCom enterprise certification + 会话存档 license (verify current pricing, tiers changed late 2025) | PM | P3 |
| Stripe HK account + KYC (HK entity docs) | Finance | P4 |
| PayPal business account | Finance | P4 |
| Domain purchase (`.com`) | Ops | P1 |
| Firm USPTO.gov account + ODP bulk access (TDXF daily feed: ODP profile 4 fields + API key) | Attorneys | P5 — M7.1 feed (FA-011) |
| ODP profile fields complete (4 fields req. since 2026-08-18) | Attorneys | P5 |
| Attorney availability for OA spot-checks (~8 md) | Legal | P5 |
| zh/en marketing content authoring | Business | P1 |
| PRC counsel PIPL posture confirmation | Legal | P2 |
