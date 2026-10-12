# Design Questions Register

*Created: 2026-09-27 | Companion to PRD v2.0 · docs/DECISIONS.md · docs/ARCHITECTURE.md · docs/SCHEDULE.md | Owner: Architect (answers) · Developer (raises) · QA (challenges)*

---

## 1. Purpose

This document is the **single, living register of open product/design questions** for MarkUS. It exists so that:

1. **No design decision is made unilaterally in code.** Anything ambiguous in PRD v2.0 / ARCHITECTURE.md is raised here first, with a written issue, so the reasoning survives chat history and code review.
2. **Ambiguity is resolved before it becomes expensive.** Most items below become materially harder to change once a baseline migration, an auth flow, or a marketing page is shipped.
3. **Answers are auditable and traceable.** Each answer records who decided, when (Beijing time), and what was decided. Any answer that changes product scope or architecture is mirrored as a new `D-xx` entry in [DECISIONS.md](./DECISIONS.md) and, if data changes, as a Prisma migration note.
4. **Gate reviews have a fixed agenda.** At each milestone gate (M0–M7, SCHEDULE.md) the register is walked: nothing `AWAITING ANSWER` on a blocking item, or an explicit deferral is recorded.

**Scope:** product and design decisions only (scope, data model semantics, business rules, compliance posture, UX behaviour, vendor selection). Engineering implementation choices (library versions, code structure, test tooling) are *not* registered here — they are made by the developer and defended in code review; the few that contradict a written standard are registered for confirmation (see DQ-004).

**How to use:** the developer adds a `DQ-nnn` entry as soon as ambiguity is hit; the Architect answers (or defers, or rejects the framing); QA may challenge an answer and the entry records the challenge. Do not delete entries — close them with a status. The register is expected to grow to 60–100 entries over the project.

### 1.1 Field conventions

| Field | Meaning |
|---|---|
| **Raised by / Raised at** | Who raised it, and when (Beijing time, `YYYY-MM-DD HH:mm CST` = UTC+8) |
| **Severity** | `Critical` blocks a gate or risks law/ToS violation · `High` locks a schema, auth or compliance design · `Medium` affects scope/effort/a later phase · `Low` polish; batch at next gate review |
| **Blocks** | Gate and/or subphase that cannot start (or cannot be finished) without an answer |
| **Status** | `AWAITING ANSWER` · `ANSWERED — CLEARED` · `ANSWERED — ACTION REQUIRED` · `DEFERRED (to phase)` · `WITHDRAWN` |
| **Discussion** | Who discussed it and when (filled at review time; multiple entries appended, not overwritten) |
| **Answered by / Answered at** | Decision owner and decision timestamp (Beijing time) |
| **Engineering view** | Developer's read + preferred option. **Advisory only** — it is not a decision and does not authorise code. |

### 1.2 Open questions at a glance

| ID | Question | Severity | Blocks | Status |
|---|---|---|---|---|
| DQ-001 | Anonymous assessment vs. mandatory `Trademark.contactId` | High | P0.1, P5.6 | ANSWERED — R-001 |
| DQ-002 | Expert read scope: assigned cases only vs. all | High | P2.1, P7.1, P8.1 | ANSWERED — R-002 |
| DQ-003 | `PipelineStage` / `SalesMetrics`: modelled or derived | Medium | P7.3, P7.6 | ANSWERED — R (2026-10-11): Option C hybrid — stage derived, period metrics materialised (D-23) |
| DQ-004 | Lint standard & CI parity (`turbo run lint` covers only web) | Low | P0.2, P0.3 | ANSWERED — CLEARED |
| DQ-005 | Magic-link scope model, TTL, delivery channel | High | P2.1, P4.2 | ANSWERED — R-005 |
| DQ-006 | Contact identity: dedup / merge policy across channels | Medium | P3.3, P7.1 | ANSWERED — R (2026-10-11): Person/Company split (D-20), never auto-merge, MASTER_ADMIN audited merge (D-21) |
| DQ-007 | Invoice currency, FX source and FX lock moment | High | P4.1, P4.3 | ANSWERED — R-007 |
| DQ-008 | Order shape for multi-class filings & fee line items | High | P0.1, P4.1 | ANSWERED — R-008 |
| DQ-009 | Refund authority & per-line-item refundability | Medium | P4.2, P4.3 | ANSWERED — R (2026-10-11): policy-driven cut-offs, two-step (request/approve), threshold USD 200 (D-22) |
| DQ-010 | What the assessment surface shows before M5 | High | P1, P2, P5 | ANSWERED — R-010 |
| DQ-011 | Feature-flag mechanism & who may flip in prod | Medium | P0.3 | ANSWERED — R-011 |
| DQ-012 | Retention schedule & PIPL erasure workflow | High | P2, P3, P8.1 | ANSWERED — R (2026-10-11): pseudonymise; retention outranks erasure; matrix in ARCH-02 §6; legal basis PENDING PRC counsel (OPEN-09) |
| DQ-013 | Staff auth method for Phase 1 (password vs. staff magic link) | Medium | P2.1 | ANSWERED — R-013 |
| DQ-014 | 会话存档 consent capture & non-consented staff | High | P3.4, M3 | ANSWERED — R-014 |
| DQ-015 | Round-robin definition: timezone, holidays, no-staff fallback | Medium | P3.5, M3 | ANSWERED — R-015 |
| DQ-016 | Anonymous assessment endpoint: abuse & scraping controls | Medium | P5.6 | ANSWERED — R-016 |
| DQ-017 | Notification delivery: transactional-email provider | Medium | P2.5, P3.1, P4.2 | ANSWERED — R (2026-10-11): AliCloud DirectMail (intl, SG), `mail.<domain>`, email mandatory |
| DQ-018 | Staging target & IaC: managed cloud vs. Docker-on-VM | High | P0.3, M0 | ANSWERED — R-018 (region: HK, no ICP for now) |
| DQ-019 | Money precision: `Decimal(12,2)` (ARCH-02 §1) vs `Decimal(14,2)` (M3.3) | High | P4, M3.3 | ANSWERED — R-019 |
| DQ-020 | `AuditLog` partitioning conflicts with Prisma's single-field `@id` | High | P7, M11.3 | ANSWERED — R-020 |
| DQ-021 | M3.2 names `TrademarkAssessmentFactors`; ARCH-02 §5.1 does not model it | Medium | P6, M6.1 | ANSWERED — R-021 |
| DQ-022 | Repository had no baseline migration — `0P3__*` is a full baseline | High | P0.3, M3.2 | ANSWERED — R-022 |

---

## 2. Questions

### DQ-001 — Anonymous assessment vs. mandatory `Trademark.contactId`

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** — cheap to fix today, expensive after the baseline migration |
| Blocks | P0.1 data-model sign-off (an M0 criterion), P5.6 public surface |
| Status | **ANSWERED** — see §5, R-001 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-001 |

**Issue.** PRD §4.1 step 2 requires the assessment step to be usable *"anonymous allowed"*, but `packages/db/prisma/schema.prisma:341` makes `Trademark.contactId` mandatory, and every downstream read path (orders, documents, conversations) assumes a `Contact` owner. There is no model for an anonymous candidate mark, and no defined lifecycle for it (retention, conversion, consent basis for storing a submitted mark + any PII).

**Why it matters.** The public assessment tool is the top-of-funnel asset (PRD §1.3, §3.1.5). If anonymity is not representable, we either force a lead form before scoring (kills the ≥3% visitor→contact metric) or pollute `Contact` with non-persons, which corrupts round-robin assignment, CRM filters and ERP pipeline numbers (DQ-015, P7.3).

**Options.**
- **A** Make `Trademark.contactId` nullable; anonymous rows are ownerless, TTL-purged, never attached to a `Conversation`/`Order`.
- **B** Create a `Contact` in an `ANONYMOUS`/lead state on submission (minimal PII: name/email/phone/wechat all null); keeps FKs non-null and one code path.
- **C** Separate `AssessmentRequest` entity for anonymous traffic; a `Trademark` is only created when a lead converts to a `Contact`.

**Engineering view.** C is cleanest: a trademark candidate and a CRM contact are different things, and B makes `Contact.email`/`phone` uniqueness plus "assigned salesperson" semantics awkward for records that are not people. C costs one entity plus a conversion step. **Product decision required on the retention/consent basis for anonymous submissions (cross-link DQ-012).**

---

### DQ-002 — Expert read scope: assigned cases only vs. all

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** |
| Blocks | P2.1 auth matrix, P7.1 staff management, P8.1 security review |
| Status | **ANSWERED** — see §5, R-002 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-002 |

**Issue.** `packages/core/src/rbac.ts:36-42` grants `EXPERT` both `contact.read.all` and `lead.read.all`. PRD §2 limits an Expert to *"manage assigned cases"*, while ARCHITECTURE §3.2 says *"expert sees assigned/all cases per policy"* — the policy is undefined, so the code currently encodes a broader scope than the PRD states.

**Why it matters.** This is the deny-by-default matrix that PRD §6.2 and ARCHITECTURE §3.2 declare the single source of truth, unit-tested (`rbac.test.ts`). Whatever we decide becomes the reference implementation, and the P8.1 security review will test exactly this boundary. Client PII visibility is a PIPL question, not only a UX one.

**Options.**
- **A** Strict: `EXPERT` sees only cases assigned to them (`contact.read.assigned`, `case.read.assigned`).
- **B** Read-all / write-assigned (current code).
- **C** Per-expert flag (`canViewAllCases`) managed by Master Admin; default off.

**Engineering view.** The mechanism should be explicit either way: a `case.read.all`-style permission plus a row-scoping helper in `packages/core`, so the matrix grants *capability* and the scoping function applies *scope*. A is the literal PRD reading; B has a plausible business reason (attorneys cross-referencing office-action patterns across matters). Needs an explicit ruling so we do not ship a silent over-permission.

---

### DQ-003 — `PipelineStage` / `SalesMetrics`: modelled or derived

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P7.3 pipeline & metrics, P7.6 reporting/exports |
| Status | **ANSWERED** |
| Discussion | Answer below (2026-10-11, owner/MD; engineering recommendation confirmed) |
| Answered by | **Architect (ADR D-23)** |
| Answered at | 2026-10-11 — see Answer below |

**Issue.** PRD §5.11 promises `Budget/Campaign, PipelineStage, SalesMetrics` entities. The schema has `Campaign` only. `Contact.stage` (a `LeadStage` enum column) and `Lead.status` exist, so pipeline data *could* be derived, but salesperson performance metrics (PRD §3.4.4) and budget tracking (P7.2) have no defined source of truth.

**Why it matters.** Derived queries are always correct and cost nothing to maintain; materialised aggregates are fast but need backfill, staleness handling and a reconciliation story. It also decides whether P7.3 is a 8-md SQL/reporting task or an 8-md pipeline-plus-backfill task.

**Options.** **A** Derive everything at query time (fresh, no ETL, slower on large volumes). **B** Daily materialised aggregates (fast dashboards, backfill job + staleness alert). **C** Hybrid: stage distribution derived, monthly/period metrics materialised.

**Engineering view.** C, decided before P7.3 starts (not blocking now). No schema commitment until then — but the aggregate tables, if chosen, must be designed with a `period` + `salespersonId` key and a backfill job from day one.

**Answer (2026-10-11, owner/MD; recorded by Architect as ADR D-23).** **Option C (hybrid)** confirmed.
- **`PipelineStage` is not a table** — the stages are the existing `LeadStage` enum; stage distribution is a **derived** `GROUP BY stage` over `Contact`, served by the existing `contact (stage)` index (`ARCH-02` Q2). Always fresh, no ETL.
- **`SalesMetrics` is materialised** as a period aggregate keyed by **(`period`, `salespersonId`)** (with an org-level roll-up), populated by a scheduled backfill job, carrying `generatedAt` and a **staleness alert**; the period grain is fixed at P7.3 kickoff. The read index registers as a Q-row (reserved **Q22**) when the table lands.
- **Budget** (P7.2) reads `Campaign` + order lines; no new entity.
- `M11.2` amended: `/crm/pipeline` derived and indexed; `/crm/funnel-metrics` + salesperson/period metrics from rollups. No schema commitment until P7.3 (per the issue); this ADR fixes the approach and its design constraints.

---

### DQ-004 — Lint standard and CI parity

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Low** (engineering-owned; needs DoD confirmation) |
| Blocks | P0.2 "TS/lint/test standards", P0.3 CI pipeline completeness |
| Status | **ANSWERED — CLEARED** |
| Discussion | 2026-09-27 17:40 CST — Developer presented option A (shared ESLint config in `packages/config`, `lint` in every workspace, `pnpm lint` in CI) and the stricter alternative; Architect approved option A and authorised P0.2/P0.3 hardening to proceed |
| Answered by | Architect (session approval) |
| Answered at | 2026-09-27 17:40 CST |

**Issue.** `turbo.json` declared a `lint` task, but only `apps/web` defined a `lint` script and there was no ESLint configuration anywhere in the repo; `.github/workflows/ci.yml` ran typecheck → test → build and never linted. ARCHITECTURE §8 lists `lint` as the first CI step, and P0.2's DoD ("Empty app builds + tests green") is silent on lint.

**Why it matters.** The documented pipeline and the actual pipeline disagreed; the gap gets more expensive as 6 more packages land.

**Options.** **A** Add an ESLint flat config in `packages/config`, `lint` scripts in every workspace, and a `pnpm lint` step in CI. **B** Defer to P8.1.

**Engineering view.** A. The repo is otherwise well-configured for strictness already (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`); I intend to keep those on. Confirm the expected strictness/preset so P0.2 can close, and whether `next lint` is acceptable for `apps/web` or the whole repo should move to a single flat config.

**Answer (option A, implemented 2026-09-27).** ESLint 9 flat config at the repo root, composed from `packages/config/eslint/base.mjs` (`js.configs.recommended` + `typescript-eslint` recommended) with `eslint-config-next` (`core-web-vitals` + `typescript`) scoped to `apps/web`; `pnpm lint` is the single command and is deliberately **not** a turbo task, so there is no per-package gap. Type-aware linting is deferred to a follow-up once the code has real types to analyse. One override: `@next/next/no-html-link-for-pages` is off (Pages-Router-only rule, false error on an App Router project) — documented in `infra/README.md` §5. Strictness flags (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) kept as-is.


---

### DQ-005 — Magic-link scope model, TTL and delivery channel

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** |
| Blocks | P2.1 (auth core), P4.2 (pay from portal) |
| Status | **ANSWERED** — see §5, R-005 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-005 |

**Issue.** ARCHITECTURE §3.1 specifies a *"single-use, hashed at rest, 15-min TTL, bound to `contact_id` + scope"* token, and §4.3 delivery "via WeCom message or email". Undefined: (a) what scopes exist; (b) whether email is a real channel, given `Contact.email` is optional; (c) which roles may issue a link; (d) how many tokens may be live per contact, and re-issue UX; (e) whether a 15-minute TTL is compatible with *paying an invoice days after receiving a link* (PRD §3.5, §4.1 step 8).

**Why it matters.** Magic-link is the client's only credential (D-06: no registration, no passwords). Token design is the single highest-risk auth surface in the product and is unit-tested/reviewed at P8.1. A 15-minute TTL that breaks invoice payment would push us toward emailing a fresh link at checkout time — a decision we should make deliberately, not discover in QA.

**Options.**
- **A** One `portal` scope, short TTL, freely re-issuable; after claim the client holds a session cookie with rolling expiry.
- **B** Per-purpose tokens: `upload`/`status` (short TTL) vs. `pay:<invoiceId>` (TTL aligned to `due_at`, revocable, single-use).
- **C** A** + B: portal session for the workspace, single-purpose payment links for money.

**Engineering view.** C. `scope` in §3.1 then means a real claim in the token payload, and revocation of an unpaid link becomes possible (a client can cancel an order). Please also confirm the delivery-channel priority (WeCom message first, email fallback, or both) and whether a Salesperson may issue links for any contact or only assigned ones (`contact.create` currently permits creation; issuance authority is unstated).

---

### DQ-006 — Contact identity: dedup and merge policy across channels

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** (escalates to High once P3 sync starts) |
| Blocks | P3.3 客户联系 sync, P7.1 staff management |
| Status | **ANSWERED** |
| Discussion | Answer below (2026-10-11, owner/MD) |
| Answered by | **Architect (rulings D-20, D-21)** |
| Answered at | 2026-10-11 — see Answer below |

**Issue.** `Contact.email` and `Contact.phone` are unique but optional; `WeComLink.externalUserId` is unique. Nothing states whether a `Contact` is *one legal person/company* or *one channel identity*. A client who first arrives via 微信客服 (no email, no phone) and later follows up via 客户联系, or who uses two WeChat accounts for the same company, produces duplicates that fragment orders, invoices and document history.

**Options.** **A** Match on `WeComLink` first, then normalised email/phone; never auto-merge — flag a candidate duplicate for Master Admin. **B** Auto-merge with `AuditLog`. **C** Salesperson confirms before merge.

**Engineering view.** A, with an explicit merge operation restricted to Master Admin and fully audited. Related: should `Contact` carry a `legalName`/`company` field separate from the channel-facing `name` (invoices need a legal name; the WeChat contact name is not one)? Please rule on the identity model, because invoices, payment receipts and power-of-attorney documents all depend on it.

**Answer (2026-10-11, owner/MD; recorded by Architect as ADRs D-20, D-21).** The owner expanded the model beyond a single flat contact:
- We chat with **people**; one person can represent **several companies over time** (job changes) and several at once.
- A **group** has **many subsidiaries**; a **company** owns **many marks**; an individual can also own a mark.
- Cross-sell runs **through a person** *and* **through a company/group**.

**Option A** accepted (never auto-merge). Recorded as:
1. **D-20 — identity model.** `Contact` = the natural person (add `Contact.legalName`); new **`Company`** (legal entity, `registrationNo`, self-relation `parentCompanyId` for group/subsidiary); new **`ContactCompany`** temporal M:N (`role` `LEGAL_REP|CONTACT|ATTORNEY|FINANCE|OTHER`, `startedAt`/`endedAt`, `isPrimary` — history kept, not overwritten); **`Trademark` owner is polymorphic** — `contactId` (individual) **XOR** `companyId` (company), enforced by `ck_trademark_owner_xor`. Both cross-sell vectors are first-class. Full shape in `ARCH-02` §2.1/§5.
2. **D-21 — merge policy.** Detection **never mutates**: it writes a `ContactMergeCandidate` (match order `WeComLink` → normalised email → normalised phone). Merge is **`MASTER_ADMIN`-only, audited**, reassigning every FK edge to the survivor via each owning module's port in one transaction; the loser gets `mergedIntoId` + `deletedAt` and is **never hard-deleted**.
3. These tables land in the **P0.3 backlog before P3 WeCom sync** (mandate `M4.6`; `M4.2` updated), so links are created against the right entity from the start. Open follow-up: the `Company`/contact-link/merge endpoints in `03-api-contract.yaml` (OPEN-10).

---

### DQ-007 — Invoice currency, FX source and FX lock moment

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** |
| Blocks | P4.1 invoice model, P4.3 FX display & reconciliation |
| Status | **ANSWERED** — see §5, R-007 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-007 |

**Issue.** D-05 sets USD base pricing with live CNY *display* conversion, CNY being presentment-only, settlement in HKD/USD. Undefined: (a) which currency the invoice is issued and charged in; (b) the FX rate source and who operates it; (c) when the rate is locked; (d) the FX basis for refunds; (e) whether mainland Alipay / WeChat Pay presentment will be USD (client charged in USD) or CNY.

**Why it matters.** (e) is a real payment-rail question, not a display question: cross-border Alipay/WeChat typically settle in USD, so a "CNY price" that we cannot charge is a promise we cannot keep. (c) and (d) are consumer-protection exposure — a client who sees "¥3,200" must be able to reconcile it against what was charged.

**Options.** **A** Invoice and charge always USD; CNY shown as indicative only, with the rate, source and timestamp snapshotted onto the invoice for transparency. **B** Allow CNY-presented invoices settled in USD at a locked rate.

**Engineering view.** A, with `fxRate` / `fxRateSource` / `fxRateLockedAt` columns on the invoice (schema change) and an explicit "indicative, non-binding" label in all three locales. One documented rate provider, daily snapshot, last-good-rate fallback with a staleness alert (ARCHITECTURE §7 probe pattern). Please confirm the rate source and whether a rate is shown at all, or only a converted total.

---

### DQ-008 — Order shape for multi-class filings and fee line items

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** — affects the P0.1 schema before the baseline migration exists |
| Blocks | P0.1, P4.1 |
| Status | **ANSWERED** |
| Discussion | — |
| Answered by | **Architect (one line item per mark + Nice class)** |
| Answered at | 2026-09-29 — see §5, R-008 |

**Issue.** `Order.trademarkId` is singular and `InvoiceLineItem` has no per-class or per-mark dimension. In practice a US application is frequently multi-class: USPTO charges a base filing fee *per class*, and our service fee may be per mark or per class. D-05 requires itemized separation of `SERVICE_FEE` vs `USPTO_FEE`; today the schema cannot express "one order, 3 classes, 3 government fees + 1 service fee" without an ambiguous description string.

**Why it matters.** This is the invoice the client disputes when it is wrong, it drives refund-per-line logic (DQ-009), and it is a schema decision that is trivial before the first migration and painful after.

**Options.**
- **A** One `Order` per application; N `USPTO_FEE` line items (one per class); `Order ↔ Trademark` stays 1:1.
- **B** One `Order` per class (multiple orders per application) — poor client experience, multiple payment attempts.
- **C** `Order` with a join to N `Trademark`s and an optional `niceClass` on the line item — supports portfolio bundling.

**Engineering view.** A if each filing is billed separately; C if we ever sell a portfolio/bundle. Please also confirm where the price list lives (hard-coded config vs. a DB table the Master Admin can edit — PRD §3.4.2 has budget allocation but nothing for price books), and whether government fees are passed through at cost (which implies an FX/refresh problem when USPTO changes fees mid-quarter).

---

### DQ-009 — Refund authority and per-line-item refundability

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P4.2, P4.3 |
| Status | **ANSWERED** |
| Discussion | Answer below (2026-10-11, owner/MD; recommended defaults confirmed) |
| Answered by | **Architect (ADR D-22)** |
| Answered at | 2026-10-11 — see Answer below |

**Issue.** `order.refund` is Master Admin only; `InvoiceLineItem.refundable` defaults to `true` for every kind. There is no written refund policy, and no `Refund` entity — while `Payment.status` already anticipates `PARTIALLY_REFUNDED`. Stripe/PayPal refunds are issued against a *charge*, not a line item, so per-line refunds inherently produce multiple provider-side refund objects that our ledger must represent.

**Options.** **A** Policy-driven: refundability derived from `kind` + order status (`USPTO_FEE` non-refundable once filed), request/approve two-step, Master Admin executes, every step audited. **B** Fully manual via provider dashboard, reconciled manually. **C** Automatic on cancellation.

**Engineering view.** A, and I recommend adding a `Refund` table (provider refund id, amount, currency, line item link, actor, reason) so the daily reconciliation job has something to match against — otherwise M4's "webhook/reconciliation success 100%" cannot be evidenced for partial refunds. This is a schema addition; please confirm the policy wording (who may authorise, and the USPTO-fee cut-off) so the rules can be encoded and unit-tested.

**Answer (2026-10-11, owner/MD; recorded by Architect as ADR D-22).** **Option A** confirmed. The `Refund` + `RefundAllocation` tables the engineering view asked for already shipped in P0.3, so this is policy-only. Recorded rules:
- **Refundability by line** (encoded in a `refundPolicy` module with tests; `InvoiceLineItem.refundable` becomes a snapshot flag, recomputed at refund time): `USPTO_FEE` refundable **only until the filing is recorded** (`Application.serialNumber` set), non-refundable after; `SERVICE_FEE` refundable **until the application is filed**, then Master-Admin discretionary with a reason; `OTHER` discretionary, default refundable.
- **Two-step authority**: any staff holding **`order.refund.request`** requests (creates a `PENDING` `Refund`); **`order.refund`** (= `MASTER_ADMIN`) approves and executes.
- **Threshold**: above the configured value a **second, distinct** Master Admin is required — **initial value USD 200** (config, not code). This **closes OPEN-07**.
- Refunds are rows + `RefundAllocation` per line + an `Order.status` transition, never mutations; `providerRefundId` is the `M10.5` reconciliation key.
- Follow-up OPEN-11: contract + schema delta (`Refund.status`, `Refund.requestedById`, the `order.refund.request` vocabulary, request/approve endpoints).

---

### DQ-010 — What the assessment surface shows before M5

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** |
| Blocks | P1 (site CTA), P2.6, P5 |
| Status | **ANSWERED** — see §5, R-010 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-010 |

**Issue.** PRD §3.6 specifies the probability tool as a live feature, but D-03 states *"Phase 1 keeps manual (attorney) assessment — no model"*, and the M5 gate is where the model is validated. So between M1 (site live) and M5 there is a window with a marketed CTA and no model. Related gap: `Trademark` has `probabilityReviewedAt` but no reviewer and no verdict, so an attorney review of a score is not representable.

**Why it matters.** D-03 forbids accuracy claims before validation, and PRD §3.6.7 mandates disclaimers on every result. Showing a heuristic "score" before M5 would be a marketing/legal exposure; showing nothing wastes the funnel the metrics depend on.

**Options.**
- **A** Flag-gated: the site CTA is a "request a preliminary attorney assessment" lead form; the scored tool appears at M5.
- **B** Ship a clearly non-probabilistic heuristic (trigram/phonetic only) labelled as "similarity screening, not a probability".
- **C** Attorney-only review workflow from P2 with a manual turnaround SLA.

**Engineering view.** A is the lowest-risk reading of D-03 and costs a feature flag (DQ-011). If C is chosen, we need the review fields on `Trademark` (`probabilityReviewedById`, verdict, notes) and an SLA. Please confirm which surface ships first, and whether an attorney verdict ever overrides a model score in the client-facing view.

---

### DQ-011 — Feature-flag mechanism and who may flip in prod

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P0.3 (CI/CD deliverable), and the out-of-order deploy strategy in ARCHITECTURE §8 |
| Status | **ANSWERED** — see §5, R-011 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-011 |

**Issue.** ARCHITECTURE §8 says *"feature flags per phase subphase (Unleash-lite or env-based)"* — explicitly undecided. Undefined: the mechanism, the owner of the flag namespace, who may change a flag in production, and whether flipping requires a deploy (git-audited) or is instant.

**Options.** **A** Typed env-based flags in `packages/config` (flip = redeploy, fully git-audited, zero infra). **B** Unleash in HK (UI, instant, audit log, new service to operate). **C** A now, B if user-targeted targeting is ever needed.

**Engineering view.** A for P0–P8: our flags are phase gates, not user targeting, and "flip = PR + deploy" matches the manual gate in ARCHITECTURE §8. Please confirm, and name the initial flag set (`ASSESSMENT_TOOL`, `PAYMENTS`, `WECOM_ARCHIVE`, `PORTAL_UPLOAD`, …) so the P0.3 PR is reviewable against a fixed list.

---

### DQ-012 — Retention schedule and PIPL erasure workflow

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** |
| Blocks | P2 (storage), P3 (archive), P8.1 security review |
| Status | **ANSWERED** |
| Discussion | Answer below (2026-10-11, owner/MD; recommended defaults accepted) |
| Answered by | **Architect (business posture recorded)** |
| Answered at | 2026-10-11 — see Answer below |

**Issue.** PRD §6.2/§6.3 and D-04 commit us to PIPL (consent-based collection, minimisation, no client PII to third parties), but no retention schedule exists anywhere in PRD, ARCHITECTURE or the schema. Open items: retention per data class (client documents and OCR text, archived WeChat messages, anonymous assessment submissions, audit logs, invoices, raw USPTO archives — 7 days is stated for the latter only); how a PIPL Art. 47 erasure request is fulfilled given that invoices, payments and audit logs must be retained for accounting/legal reasons; and whether erasure is deletion, anonymisation, or soft-delete.

**Why it matters.** Deletion semantics touch every table's foreign keys and the "row-level scoping" security controls (ARCHITECTURE §6). This is also the kind of finding an external reviewer or a client will test directly. It also feeds DQ-001 (anonymous submissions) and DQ-014 (archived messages).

**Options.** **A** Documented retention matrix + scheduled purge worker (BullMQ), with `deletedAt` soft-delete on `Contact` and hard deletion of dependent content. **B** Manual-only, by policy. **C** Per-record TTL columns.

**Engineering view.** A: a `retention` config module + a `purge` queue, and a written matrix (data class × retention × deletion mode) that QA can test against. Requesting the matrix is the ask — the retention periods themselves are a business/legal decision I should not invent.

**Answer (2026-10-11, owner/MD; recorded by Architect).** Option **A** confirmed, with the schedule already in `ARCH-02` §6 stood as the **interim engineering baseline** and a per-column matrix added for M12.7. **Art. 47 erasure = pseudonymisation, not hard delete:** on a verifiable request, `Contact` PII columns (`name`, `email`, `phone`, `wechatAlias`) are nulled while the `id` (cuid, not reversible to identity) remains as a pseudonymous stub so FK edges to statutory records stay intact; `Message.content` is tombstoned `[redacted]` + `redactedAt`; `WeComLink` rows are deleted (external id re-identifies via WeCom); client document R2 objects are async-deleted ≤ 7 days with `Document.deletedAt` soft-delete on metadata. **Statutory retention outranks erasure:** `Invoice/Payment/Order/Application/OfficeAction` (5-yr floor) and `TrademarkAssessment`/`AuditLog`/`ConsentRecord` (append-only / audit evidence) are never deleted on a request. Anonymous assessment submissions (R-001/R-010) persist nothing → out of scope. **Legal basis per class remains PENDING PRC counsel (OPEN-09, P2)** — the engineering periods stand as the interim baseline until legal sign-off; the erasure report (M12.7) must state the basis per column.

---

### DQ-013 — Staff auth method for Phase 1

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P2.1 |
| Status | **ANSWERED** — see §5, R-013 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-013 |

**Issue.** ARCHITECTURE §3.1 says staff authenticate by *"Email+password or magic link"*, but D-06 requires Master-Admin-provisioned accounts, which implies passwords exist. If passwords ship, we need a reset path, a hashing policy and a lockout policy; if staff magic-link only, we need a mail provider (see DQ-017) and a provisioning-time enrolment flow. The staff MFA story also interacts with D-01: our own staff MFA is separate from the attorney's USPTO MFA, and it is not stated whether staff must have MFA on our platform.

**Options.** **A** Email+password with Master-Admin reset (no self-service reset). **B** Admin-provisioned + staff magic link only. **C** A, plus mandatory MFA (TOTP/WebAuthn) for staff with vault access.

**Engineering view.** C, because `vault.uspto.read` is the highest-privilege permission in the matrix and PRD §6.2 treats the vault as the crown jewel; the cost is one dependency and an enrolment flow. Please confirm the Phase-1 minimum and whether staff MFA is required for all roles or only for `EXPERT`/`MASTER_ADMIN`.

---

### DQ-014 — 会话存档 consent capture and non-consented staff

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** (M3 gate depends on it) |
| Blocks | P3.4, M3 |
| Status | **ANSWERED** — see §5, R-014 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-014 |

**Issue.** 会话存档 requires member-side (staff) consent configured in the WeCom admin console and a dual-side notice to contacts (PRD §3.3.3, §6.2, ARCHITECTURE §4.2). Undefined: (a) do we mirror staff consent into our own `ConsentRecord` rows or trust WeCom as the system of record; (b) is WeCom's built-in notice sufficient, or must our channel/script render its own (and who owns that copy — Business/Legal); (c) **what happens when a staff member has not enabled archiving** — their chats are simply absent from our DB, which silently corrupts response-time/SLA metrics and the M3 measurement; (d) retention of archived message bodies.

**Why it matters.** The M3 gate is *"lead → auto-assigned ≤5 min → archived (consented)"*, and PRD §3.3.3 promises supervision of all message types including recalled ones. If consent coverage is partial, the supervision claim and the deflection metric (§1.3) are both unverifiable, and the business may make staffing decisions on incomplete data.

**Options.** **A** Hard rule: staff without archive consent cannot receive assignments (enforced in the assignment picker), so coverage is 100% by construction. **B** Allow assignment, surface a consent-coverage metric and accept the gap. **C** Block only the reporting that would be wrong.

**Engineering view.** A, with `ConsentRecord(kind=SESSION_ARCHIVE)` mirrored from WeCom state at sync time and a coverage check in the M3 exit criteria. Please confirm whether WeCom exposes member consent state via API (it is configured in the console today, per D-06 business prerequisites) and who signs off the dual-side notice wording.

---

### DQ-015 — Round-robin definition: timezone, holidays, no-staff fallback

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P3.5, M3 (SLA measurement) |
| Status | **ANSWERED** — see §5, R-015 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-015 |

**Issue.** ARCHITECTURE §4.1 specifies *"round-robin picker (least-recently-assigned, business hours)"* and PRD §1.3 measures *"new contact → tagged + assigned ≤5 min (median, business hours)"*. Undefined: business hours in which timezone (HKT default, but sales staff are in mainland China), which holiday calendar, what happens when every salesperson is disabled/on leave (fall back to Master Admin, or hold in an unassigned queue?), and when the 5-minute clock starts (first inbound message, or after AI qualification finishes?).

**Why it matters.** The picker and the metric must use the same definition or the M3 gate measures the wrong thing. "Least-recently-assigned" also needs a tie-break and a new-hire rule (a salesperson with zero assignments is both least-recently-assigned *and* a valid target — do we round-robin by count, or by last-assignment timestamp with new hires last?).

**Options.** **A** Business hours = Mon–Fri 09:00–18:00 in the salesperson's local timezone, HK public holidays, Master Admin as fallback, clock starts at first inbound message. **B** A single firm-wide window (HKT) for simplicity and a uniform metric.

**Engineering view.** B for the metric's sake (one comparable window), A for the picker (fairness per person), with the clock start defined once and used by both. Please confirm the window, the calendar source (HK vs. CN public holidays — they differ), and the no-staff-available behaviour.

---

### DQ-016 — Anonymous assessment endpoint: abuse and scraping controls

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P5.6 |
| Status | **ANSWERED** — see §5, R-016 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-016 |

**Issue.** P5.6 plans a *public* assessment API, anonymous by design (DQ-001). Unstated: rate limits, bot mitigation, and whether the endpoint may be used to enumerate our USPTO-derived index (which would be a redistribution of USPTO data under our own terms). The 24h result cache (PRD §3.6.8) also bounds cost only for *repeat identical* queries; a scraper varying goods/services strings defeats it.

**Options.** **A** Redis sliding-window rate limit per IP + a self-hosted challenge after a threshold, cache key normalisation, and per-request cost metering with an alert on spend. **B** Gate the tool behind the WeCom contact step (lead capture first). **C** Both.

**Engineering view.** A, with C as the fallback if abuse materialises. Note that a mainland-reachable challenge provider must be chosen deliberately (D-04's GFW/mainland-access sensitivity applies to the marketing edge). Please confirm whether the tool is open to all visitors or lead-gated from day one — that decision also changes DQ-001 and DQ-010.

---

### DQ-017 — Notification delivery: transactional-email provider

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P2.5, P3.1, P4.2 (payment links) |
| Status | **ANSWERED** |
| Discussion | Answer below (2026-10-11, owner/MD) |
| Answered by | **Architect (vendor ruling recorded)** |
| Answered at | 2026-10-11 — see Answer below |

**Issue.** ARCHITECTURE §4.3 assumes magic links are delivered "via WeCom message or email", PRD §2/§3.2.5 assume status notifications, and `NotificationChannel` is `WECHAT | EMAIL | PORTAL` — but no mail provider appears in `.env.example` and no decision was recorded. Related open point: the current documented limits on proactive outbound messages through 微信客服 (believed to be time-boxed relative to the customer's last inbound message) need confirming with Tencent, because invoice/payment reminders depend on being able to message a client who has not spoken to us that day.

**Why it matters.** Notification delivery is on the critical path for the client's most important events (payment link, status change, OA deadline) and for the 5-minute assignment notification to sales staff. If WeCom cannot push proactively, email becomes mandatory rather than optional, which changes P2.5 effort and adds a vendor dependency (and a PIPL sub-processor to document, per ARCHITECTURE §6).

**Options.** **A** WeCom message as primary, email as fallback (requires a provider decision). **B** Portal-only notifications, staff notified in-app. **C** Add an SMS/WeCom-app channel for deadlines.

**Engineering view.** A, with the provider and sending domain decided as a business-side prerequisite alongside the WeCom certification (DECISIONS.md business prerequisites table). Please confirm who owns the vendor decision, and whether a self-hosted relay (e.g. an existing HK SMTP/transactional service) is acceptable under D-04's sub-processor rules.

**Answer (2026-10-11, owner/MD; recorded by Architect).** Option **A** with email treated as **mandatory** (independent of the yet-unconfirmed WeCom proactive cap). Vendor = **AliCloud Direct Mail (国际站, Singapore endpoint `smtpdm-ap-southeast-1.aliyuncs.com`)**, chosen over the tech-matrix's earlier SES placeholder for cost effectiveness (`¥2/1000` ≈ `$0.29/1000`, resource packs cheaper; free 200/day) and mainland-China deliverability (QQ/163/Gmail — the seller base). The **Singapore region is deliberate**: D-04/ARCH-01 §3 lock data to a single HK-flow region, and the international site keeps payloads out of mainland-region processing; the CN-site (Hangzhou) variant would be a separate PIPL/legal call and is **not** the recorded default. Sending identity = **`mail.<domain>`** subdomain with **SPF/DKIM/DMARC mandatory before first send**. Domain purchase is already scheduled at P1 (Ops). No self-hosted relay: managed API/SMTP only, D-15 stands. CSP sub-processor to be documented (PIPL §6).

---

### DQ-018 — Staging target and IaC: managed cloud vs. Docker-on-VM

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 18:05 CST |
| Severity | **High** |
| Blocks | P0.3 completion, M0 ("pipeline deploys green to staging") |
| Status | **ANSWERED** — see §5, R-018 |
| Discussion | — |
| Answered by | **Architect** |
| Answered at | 2026-09-29 — see §5, R-018 |

**Issue.** P0.3 requires a pipeline that "deploys green to staging", and ARCHITECTURE §7.5 promises "infrastructure as code" with HK-region API/workers/DB — but no cloud provider, no account and no IaC tool is named anywhere, and no `infra/` Terraform/Pulumi exists. Something had to be built to make the pipeline real, so a baseline was implemented and is now in review: three Dockerfiles, `docker compose` for local full-stack, `infra/compose.staging.yml` pulling SHA-tagged images from GHCR, host-side `deploy.sh` / `rollback.sh` / `healthcheck.sh`, and `.github/workflows/deploy-staging.yml` (GitHub environment `staging` as the manual gate). The open part is what it deploys *onto*.

**Why it matters.** It determines who pays, what the backup/restore story is (ARCHITECTURE §5 says nightly `pg_dump` to object storage), whether the DB/Redis are managed or operated by us, and the HK cost envelope in ARCHITECTURE §8.1 (which currently mixes managed-Postgres pricing with an HK compute line). It is also a prerequisite that is **business-side**: an account, payment method and credentials must exist before any pipeline can be evidenced.

**Options.**
- **A** Managed cloud in HK (e.g. a provider offering managed Postgres/Redis + container runtime), provisioned with Terraform; CI pushes images, Terraform/CD applies them.
- **B** Docker-on-VM (HK VPS) with self-hosted Postgres/Redis in compose, as currently scaffolded; IaC limited to cloud-init/Ansible-style bootstrap.
- **C** Hybrid: managed database (backups, HA) + containers on a small VM.

**Engineering view.** C, and the sooner the better: the TM index in P5 is 15–25 GB with daily backfills, and self-managing Postgres/Redis is work nobody on the team is paid to do. A is acceptable if the provider is already chosen; B is fine as an interim for P0/P1 but should be labelled temporary. Either way the deploy scripts stay the same — only provisioning differs — so this decision does not block further work on P0.3, and the negative/positive boot tests in CI are provider-independent.

---

### DQ-019 — Money precision: `Decimal(12,2)` vs `Decimal(14,2)`

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-29 01:03 CST |
| Severity | **High** |
| Blocks | P4, M3.3 (BLOCKER) |
| Status | **ANSWERED** |
| Discussion | — |
| Answered by | **Architect (option A)** |
| Answered at | 2026-09-29 — see §5, R-019 |

**Issue.** Two binding documents disagree inside the same architecture package. `ARCH-02` §1 says money is *"Stored `Decimal(12,2)` + explicit `currency CHAR(3)`"*, and the P0 v1 schema already uses `@db.Decimal(12,2)`. Mandate **M3.3** says *"Amounts are stored as `Decimal(14, 2)` in the database"*. Maximum value at 12,2 is 9 999 999 999.99 — enough for this business, but the mandate's stated intent is headroom.

**Why it matters.** It is a one-line change today and a data migration later. Widening `numeric(12,2)` → `numeric(14,2)` is a metadata-only, non-blocking change in Postgres, so this is not urgent — but shipping the baseline and then discovering the mandate wanted different precision would make the first migration technically wrong.

**Options.** **A** Keep `Decimal(12,2)` per `ARCH-02` §1 and treat M3.3's "14, 2" as a typo. **B** Adopt `Decimal(14,2)` per M3.3 and correct `ARCH-02` §1 in the same change. **C** `Decimal(14,4)` to also carry a non-round unit price without rounding.

**Engineering view.** **A** for this increment — `ARCH-02` §1 is the data-model authority for storage types, the P0 v1 schema is already at 12,2, and the widening is free later. I will change it in one line the moment the Architect rules. Related: `ck_line_refund` and the CHECK constraints in the baseline are precision-agnostic, so no constraint work is lost either way. **C** is worth a sentence from Finance: if per-class USPTO fees or a percentage discount ever need sub-cent precision, 4 decimals is the right width and `(14,4)` is barely larger on disk.

---

### DQ-020 — `AuditLog` partitioning conflicts with Prisma's single-field `@id`

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-29 01:03 CST |
| Severity | **High** |
| Blocks | P7 (M11.3 audit volume), `ARCH-02` §6 |
| Status | **ANSWERED** |
| Discussion | — |
| Answered by | **Architect (option B — unpartitioned + R2 archive)** |
| Answered at | 2026-09-29 — see §5, R-020; ADR D-16 |

**Issue.** `ARCH-02` §6 requires monthly RANGE partitioning of `AuditLog` on `createdAt`. Postgres requires the partition key to be part of every unique constraint on a partitioned table, so a partitioned `AuditLog` needs `PRIMARY KEY (id, createdAt)`. Prisma models single-field `@id` only — a composite primary key would make `AuditLog` unaddressable through the generated client and would violate `ARCH-02` §7.1 ("Prisma is the only schema authority"). The two requirements cannot both hold as written.

**Why it matters.** The audit table is the one table with an unbounded, append-only, compliance-critical growth curve, and 5-year retrievability is a legal requirement (M12.6). Partitioning is the mitigation the architecture names. But an unpartitioned `audit_log` with a mis-sized autovacuum is the known bloat failure mode (`ARCH-02` §4.2.5).

**Interim posture shipped in the baseline.** BRIN on `createdAt` (tiny, range-scan friendly) plus `autovacuum_vacuum_scale_factor = 0.02` and `analyze_scale_factor = 0.01`, and a partial index for the vault-audit query (Q17). Monthly partitions are **not** created.

**Options.** **A** Composite key `(id, createdAt)` and hand-written DDL for the partition lifecycle, accepting that `AuditLog` is written through `$queryRaw`/a dedicated writer rather than the Prisma client. **B** Keep the Prisma table unpartitioned; archive closed partitions to Parquet in R2 on a schedule and keep a bounded hot window. **C** Separate append-only audit store (a dedicated schema, or an external sink) from the Prisma-managed table.

**Engineering view.** **B** unless compliance requires in-place 5-year query. It keeps Prisma authoritative, needs no composite keys, and matches the stated retention intent (24 months hot, then R2). It does mean the audit *export* endpoint (M11.4) must read archived periods, which is a real cost. **A** is the only option that satisfies §6 literally. This needs the Architect's ruling because it changes the shape of an entity the compliance story depends on.

---

### DQ-021 — `TrademarkAssessmentFactors` is named in M3.2 but not modelled in §5.1

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-29 01:03 CST |
| Severity | **Medium** |
| Blocks | P6 (M6.1 reproducibility) |
| Status | **ANSWERED** |
| Discussion | — |
| Answered by | **Architect (option A — the JSON columns are the factors)** |
| Answered at | 2026-09-29 — see §5, R-021 |

**Issue.** Mandate M3.2 lists `TrademarkAssessmentFactors` among the models the P0.3 backlog must deliver. `ARCH-02` §5.1 — the section that calls itself the binding acceptance specification — does not define it; instead `TrademarkAssessment` carries `subSignals Json` and `featureSnapshot Json`. Per the `ARCH-01` §15 rule ("ambiguity is a defect: the Developer halts and raises a question"), this is escalated rather than resolved unilaterally.

**Options.** **A** The two JSON columns are the factors; no separate model (what is implemented). **B** A real `TrademarkAssessmentFactors` table, one row per feature, so calibration (M6.5) can aggregate feature attribution in SQL.

**Engineering view.** **A** for this increment, and it satisfies the substantive requirement: M6.1's "re-running the same input reproduces the same score" is a function of `featureSnapshot`, and §1 of `ARCH-02` permits JSON for *"genuinely open-ended, non-queried payloads"*. **B** becomes necessary the moment M6.5 wants *"which feature drove a misprediction"* answered in SQL, which is the one calibration question an attorney will actually ask. Recommend deferring B to the P6 spike with a concrete query in hand rather than modelling it blind.

---

### DQ-022 — The repository had no baseline migration, so `0P3__*` is a full baseline

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-29 01:03 CST |
| Severity | **High** — it changes what the migration *is* |
| Blocks | M3.2 sign-off |
| Status | **ANSWERED** |
| Discussion | — |
| Answered by | **Architect (option A — the baseline is accepted)** |
| Answered at | 2026-09-29 — see §5, R-022; ADR D-17 |

**Issue.** `ARCH-02` §5 describes the P0.3 deliverable as a migration that *"adds"* models and columns — the language of a delta — and §5.4 provides `ALTER COLUMN … TYPE timestamptz(3)` statements that only make sense against pre-existing tables. In fact `packages/db/prisma/` contained **only** `schema.prisma`: no `migrations/` directory, no applied history, so there is nothing to be a delta against. The P0 v1 schema had never been materialised in a database.

**What was built instead.** `0P3__p0_3_backlog/migration.sql` is a full baseline: it creates all 35 tables, the enums, the P0 v1 shapes **and** the whole P0.3 backlog, then appends the authored fragments. Two consequences follow, both favourable:

1. §5.4's timezone conversion is subsumed — instant columns are declared `timestamptz(3)` from the start, so the "8-hour-of-silence" hazard that motivated §5.4 never exists.
2. The migration is **irreversible as a script** and must never be applied to a populated database without review, because there is no prior state it could safely transform.

**Options.** **A** Accept the baseline as the P0.3 deliverable and record the deviation (what is implemented). **B** Generate two migrations — an artificial `0P0__baseline` from the pre-P0.3 schema plus the P0.3 delta — to match §5's letter, giving a realistic expand/contract rehearsal. **C** Treat the current file as throwaway scaffolding and let the Architect's own `prisma migrate dev` produce the authoritative history.

**Engineering view.** **A**. B is honest-looking but manufactures a fake history — a baseline that claims to be a delta is more dangerous than one that admits it is a baseline, because a reviewer will read the diff and assume an upgrade path exists. C would throw away a reviewed, reproducible artifact. The only cost of A is documentation, and that is now in `docs/runbooks/db-migrations.md` §3. I need confirmation that a **baseline** satisfies the M3.2 verification ("zero drift" + "§5 checklist ticked with per-item evidence links"), because the wording implies a delta was expected.


---

## 3. Follow-up actions

| # | Question | Action | Owner | Due | Status |
|---|---|---|---|---|---|
| FA-001 | DQ-001, DQ-008 | Answer both **before** the baseline Prisma migration is generated, otherwise the first migration bakes in a guess | Developer → Architect | before `pnpm db:migrate -- init` | OPEN |
| FA-002 | DQ-018 | Provision the staging target (account + credentials, business side) so M0 can be evidenced rather than asserted | Architect | P0.3 | OPEN |
| FA-003 | — | Generate the baseline Prisma migration once a Postgres instance is reachable; `db:deploy` is currently a no-op | Developer | with FA-001 | BLOCKED (needs Docker/Postgres) |
| FA-004 | DQ-018 | Decide image slimming strategy before HK egress costs are known (runtime stages currently carry dev dependencies) | Developer | P8.1 | OPEN |
| FA-005 | — | Pin the staging host SSH key instead of `ssh-keyscan` trust-on-first-use | Developer | P8.1 | OPEN |
| FA-006 | DQ-004 | Revisit type-aware ESLint rules once the codebase has substantive types; measure the runtime cost first | Developer | P2 | OPEN |
| FA-007 | DQ-005, DQ-013 | `SESSION_SECRET`: shipped placeholders are now rejected outside development, but a *low-entropy* 32-character string still passes. Decide the rule (base64 ≥32 bytes vs. passphrase policy) with the auth design | Developer → Architect | P2.1 | OPEN |
| FA-008 | — | Dependency floors resolve to versions with published advisories; `pnpm audit --audit-level=high` is now a CI gate, so the next run is the work list | Developer | before M0 | OPEN |
| FA-009 | DQ-018 | Confirm the HK region's Node runtime and base image — Node 22 LTS is adopted everywhere (`node:22-alpine`); remainder is the HK region itself (OPEN-05, DQ-018) | Architect | P8.1 | RESOLVED — region confirmed HK (`fdc2369`+1) |
| FA-010 | — | **RESOLVED at `bd1cb58`** — `schema.prisma`, `migration_lock.toml`, `ci.yml`, `packages/db/package.json`, `pnpm-lock.yaml` and `migrations/0P3__p0_3_backlog/` are now committed together, so a clean clone reproduces the baseline and `pnpm db:drift` can pass. Confirm on the `bd1cb58` CI run | Developer | before M3.2 sign-off | RESOLVED |
| FA-011 | D-24, P5.1 | Provision USPTO **Open Data Portal** access — firm USPTO.gov account + ODP profile (4 fields req. since 2026-08-18) + API key — and evidence one **TDXF daily** (`trtdxfap`) download. Reed Tech + BDSS are retired; without ODP access the **M7.1 nightly feed is blocked at source**. The anonymous signed-URL path on the researcher product (`TRCFECO2`) unblocks backfill in the meantime (spike `ARCH-05` §1) | Attorneys | before P5.2 / M7.1 | OPEN |

*New actions are appended here when an answer creates follow-up work (schema change, doc update, migration note).*

---

## 4. Change log

| Date (CST) | Change | By |
|---|---|---|
| 2026-09-27 16:57 | Created. Seeded DQ-001…DQ-004 from the P0 scaffold review; DQ-005…DQ-017 added from the same pass over PRD v2.0 / ARCHITECTURE / SCHEDULE. All `AWAITING ANSWER`. | Developer (full-stack) |
| 2026-09-27 18:05 | DQ-004 answered (option A) and implemented as part of P0.2/P0.3 hardening. DQ-018 raised for the staging target / IaC decision. Follow-up actions FA-001…FA-006 opened. | Developer (full-stack) |
| 2026-09-29 01:03 | Reviewed the architecture of record (`docs/architecture/*`) and implemented mandates M1.1, M1.6, M2.1, M3.1, M3.2. Raised DQ-019 (money precision), DQ-020 (audit partitioning), DQ-021 (assessment factors), DQ-022 (no baseline migration existed). FA-001 answered: DQ-001/DQ-008 are **not** blocking the schema, because the P0.3 backlog is orthogonal to both; they still block the P1 handlers that use them. | Developer (full-stack) |
| 2026-09-29 (Architect) | Rulings R-001…R-022 issued in §5. DQ-019/020/021/022 and DQ-001/002/005/007/008/010/011/013/014/015/016/018 answered; DQ-012 and DQ-017 narrowed to business decisions; DQ-003/006/009 untouched. ADRs D-16, D-17, D-18 opened. M3.2, M3.3 and M11.4 corrected; `ARCH-02` §4.1/§5/§5.4/§6/§8 amended. FA-010 opened (split P0.3 commit). | Architect |
| 2026-10-11 (Architect) | Baseline pointers refreshed to `bd1cb58` after the Developer committed and pushed the P0.5 working tree + P0.3 schema/baseline (`git status` clean). FA-010 RESOLVED. `docs/DECISIONS.md` renumbered (audit ADR D-16; D-15 heading restored; D-17/D-18 written). `ARCH-01` §11/`ARCH-02` §7/`ARCH-04` baseline rows/`ARCH` README updated. CI status pending. | Architect |
| 2026-10-11 (Architect) | OPEN-06 **RESOLVED** — Node 22 LTS is pinned everywhere (CI `node-version: 22`, `engines >= 22`, `node:22-alpine`, `check:node` gate); stale "Node 20" text corrected in `ARCH-01` §1 runtime components / §4 tech matrix / §15 open decisions, M1.6, `ARCH-04` open-issues, `ARCH` README. `TmSimilarity.method` vocabulary aligned to the contract authority `trigram|bge|hybrid` in `ARCH-02` §5.1/§5.5 and `schema.prisma` (comment only, no migration). | Architect |
| 2026-10-11 (Architect) | CI triage on `fdc2369`/`8f614ed`: root-caused the P1012 `Refund.payment` missing back-reference (fixed by Developer at `8f614ed`), the P1003 shadow-DB ordering in the `migrations` job, and the compose-smoke "worker stays up" phase mismatch. HO2: diagnostics only. | Architect |
| 2026-10-11 (Architect) | CI rulings on the Developer's three inbound items: (1) deploy-staging trigger stays **manual until FA-002** (staging credentials), not PD-02 — retraction accepted; (2a) `COPY --chown` **prohibited repo-wide** (BUG-041, RULED — use `COPY` + `RUN chown -R node:node /app`); (2b) runtime smoke **declared Linux-only** (BUG-041); (3) R-021 condition `v`-keyed jsonb now enforced with CHECKs on `subSignals`/`featureSnapshot` (separate from the `--chown` change), compose-smoke content assertions get marker + byte-size floor immediately. Drift gate re-run after the CHECK fragments. | Architect |
| 2026-10-11 (Architect) | **DQ-017 ANSWERED (PD-03)** — transactional-email vendor = **AliCloud DirectMail (国际站, Singapore endpoint `smtpdm-ap-southeast-1.aliyuncs.com`)**; sending identity `mail.<domain>` with SPF/DKIM/DMARC mandatory; email treated as **mandatory**. Tech-matrix SES placeholder superseded; CN-site (Hangzhou) variant explicitly not the default (D-04/PIPL). Remaining: domain purchase at P1 (Ops) + 微信客服 proactive-cap confirmation. | Architect |
| 2026-10-11 (Architect) | **DQ-012 ANSWERED (PD-04)** — Art. 47 erasure = **pseudonymisation, not hard delete**: `Contact` PII columns nulled (pseudonymous `id` stub + FK edges kept), `Message.content` → `[redacted]` tombstone, `WeComLink` rows deleted, R2 doc objects async-deleted ≤ 7 days. Statutory financial/filing + append-only keys (Invoice/Payment/Order/Application/OfficeAction/TrademarkAssessment/AuditLog/ConsentRecord) **outrank erasure**. Interim matrix added to `02-data-model.md` §6 for M12.7; legal basis per class remains **OPEN-09** (PRC counsel, P2). | Architect |
| 2026-10-11 (Architect) | **DQ-006 ANSWERED (PD-05)** — owner ruled Option A + expanded identity model. **ADR D-20**: `Contact` = natural person (`+legalName`), new `Company` (self-relation `parentCompanyId` = group/subsidiary), new `ContactCompany` temporal M:N (role + `startedAt`/`endedAt`, history kept), `Trademark` owner **polymorphic** (`contactId` XOR `companyId`, `ck_trademark_owner_xor`); cross-sell via person *and* company/group. **ADR D-21**: never auto-merge — detection writes `ContactMergeCandidate`, merge is `MASTER_ADMIN`-only and audited, loser soft-deleted with `mergedIntoId`, never hard-deleted. `ARCH-02` §1/§2/§3/§4/§5/§6, `ARCH-01` §2.2 (+merge orchestration footnote), `ARCH-04` new mandate **M4.6** + `M4.2` updated + OPEN-10 opened (API surface). | Architect |
| 2026-10-11 (Architect) | **DQ-009 ANSWERED (PD-06)** — **ADR D-22**: policy-driven refundability (`USPTO_FEE` refundable only until the filing is recorded, `SERVICE_FEE` until filing, `OTHER` discretionary), encoded in a `refundPolicy` module; **two-step** authority (`order.refund.request` → `order.refund` = MASTER_ADMIN, both audited); above-threshold needs a second distinct Master Admin. **OPEN-07 RESOLVED** (initial threshold USD 200, config). `M10.3` amended, `ARCH-01` §2.2/§6.3 updated, contract refund semantics updated; contract/schema delta (Refund.status/requestedById, request/approve endpoints) = OPEN-11. | Architect |
| 2026-10-11 (Architect) | **DQ-003 ANSWERED (PD-07)** — **ADR D-23**: Option C hybrid. No `PipelineStage` table (stages = existing `LeadStage` enum; distribution derived via `contact (stage)` index, ARCH-02 Q2); `SalesMetrics` materialised keyed by (`period`, `salespersonId`) with backfill job + `generatedAt` + staleness alert (period grain fixed at P7.3); budget = `Campaign` + order lines. `M11.2` amended (pipeline derived, funnel/period metrics from rollups); rollup read index reserved as Q22. | Architect |
| 2026-10-11 (Architect) | **OPEN-02 + OPEN-03 RESOLVED** (owner rulings). OPEN-02: no external legal opinion required (internal derived-fields + attended-filing baseline stands); M7.1 halt lifted. OPEN-03: **ADR D-24** — probability cohort = **whole LIVE USPTO corpus (600/700), no origin filter**; label = **eventual registration** (censored if still pending at the horizon); label horizon **configurable, initial +6 months** from `filingDate` (→ +9/+12 later). M6.1 halt lifted, M6.5 labelled-set definition tied to D-24. **OPEN-01** updated (no merchant account/card gateway yet; planned; single multi-channel bundling gateway per D-05; payment implementation deferred behind flags). `ARCH-01` §15 / `ARCH-04` open-issues / `ARCH` README + §5.4 refreshed. | Architect |
| 2026-10-11 (Architect) | **OPEN-04 PARTIALLY RESOLVED** (owner) — 1 attorney now (California bar, admitted 2025; Shenzhen-based), capacity ≈100 applications/month; roster may grow. Platform must support N filing attorneys (per-attorney vault keys, M2.5). Concrete roster + contact details kept as **operational data, not committed** (privacy). **OPEN-12 opened**: attorney-profile fields (bar number/jurisdiction/admission/correspondence) do not exist on `StaffUser` and would be needed if the TEAS packet pre-fills the attorney section. Changelog + `ARCH-01` §15 / `ARCH-04` / README updated. | Architect |
| 2026-10-11 (Architect) | **OPEN-08 RESOLVED** — **ADR D-25**: model release requires the `M6.5` calibration report on the temporal holdout to show **≥ 500 resolved labels** *and* a **95% CI half-width on overall accuracy ≤ 5 pp** (both configurable) before promotion. `M6.5` amended; paired with the D-24 cohort/label definition. `ARCH-04` / README open-issue registers updated. | Architect |
| 2026-10-12 (Architect) | **P5.1 spike complete** (`docs/architecture/05-p51-spike.md`). ODP confirmed sole USPTO bulk XML source (product `trtdxfap`, daily); Reed Tech + BDSS DNS-dead; ODP downloads gated (sign-in + 4 profile fields + API key) → **FA-011**; anonymous signed-URL path on `TRCFECO2` available meanwhile. Corpus empirics on 12,691,941 researcher case files (2023 vintage): word share ≈ 60.7 % (≈ 92 % post-2004), LIVE exposes ≈ 11.5 M status-6xx/7xx marks; P(eventual registration) ≈ 0.60–0.62 (2009–2018 cohorts, older: 0.45–0.56); time filing→registration median **13.3 months** (≈ 1.7 % by +6, ≈ 40 % by +12, ≈ 85 % by +24). **ADR D-26** — D-24 horizon amended to **+12 months primary / +24 secondary** (a +6 horizon is ≈ 98 % censored and unusable). D-25's ≥ 500-label / ≤ 5 pp CI bars verified satisfiable at +12 (one month word filings ≈ 13–17 K resolved; half-width ≈ 4.3 pp). Abandon labels must come from the TDXF event/status history, not research status codes (`abandon_dt` empty). `DECISIONS.md`, `ARCH-01` §15, `ARCH-04` §M6.1/M6.5/§18, `ARCH` README + Documents table updated. | Architect |

---

## 5. Architect rulings (2026-09-29)

Each ruling below is binding. A deviation requires an ADR `D-16+` in `docs/DECISIONS.md`
**and** a document update in the same change (change-control rule, `docs/architecture/README.md`).
Where a ruling contradicts a shipped behaviour, the code changes, not the ruling.

### 5.1 The four P0.3 decisions

**R-019 — Money precision: `Decimal(12,2)` stands. Option A.**
`ARCH-02` §1 is the storage-type authority for the data model; M3.3's `Decimal(14,2)` is a
defect in the mandate and has been corrected in this pass. Money is computed in **integer
minor units** inside the service and quantised to the currency's minor unit (2 decimals for
USD/CNY/HKD) with half-even rounding at each line.
**Sub-cent precision is prohibited** — `USPTO fees are whole dollars`, a percentage discount is
converted to an absolute minor-unit amount at order creation and never recomputed, and a
payment rail cannot settle sub-cent anyway: an invoice that cannot be settled is not a record.
So option C `(14,4)` is **rejected**, not deferred. Widening `numeric(12,2)` to `numeric(14,2)`
remains a metadata-only online `ALTER` if the business ever outgrows 9 999 999 999.99
(≈10¹⁰), so nothing is lost by staying at 12,2. **Done:** M3.3 corrected.

**R-020 — Option B: no partitioning. BRIN + bounded hot window + R2 archive. ADR D-16.**
1. Partitioning does not buy what §6 wanted: §6 already sends everything older than 24 months
   to R2 Parquet, so the audit *export* must read archives under option A **and** option B.
   The only real difference is how the hot 24 months is bounded — `DROP` a partition, or
   batch-delete a month.
2. `AuditLog` is append-only: no update churn, no dead-tuple storm, so the classic bloat
   failure mode §4.2.5 warns about does not apply. Q15's two access paths are
   `(actor_id, created_at DESC)` and `(entity_type, entity_id)` (§4.1) — both are served by
   btree, with BRIN on `createdAt` for time-range scans. Partition pruning was never the
   load-bearing mechanism for either.
3. Option A costs more than it saves: a composite `PRIMARY KEY (id, createdAt)` breaks the
   single-field `@id` convention, forces the compliance-critical write path through
   `$queryRaw` outside the typed client, and needs hand-rolled DDL outside migrations (§7).
   Trading §7.1 for pruning on a table of this size is a bad exchange.

The interim posture shipped in the baseline — BRIN on `createdAt`,
`autovacuum_vacuum_scale_factor = 0.02` / `analyze_scale_factor = 0.01`, and the Q17 partial
index — is **accepted as the final design**, not a placeholder.
**Requirements on it:** the monthly archival job runs in `worker` (D-15-compliant), records
the `createdAt` range, row count and a checksum manifest for the month, verifies the count
before deleting, deletes in 1 000-row batches (§7.5), and alerts loudly if a month is
skipped — never silently create-at-insert. Retention: 24 months hot, archive 5 years, matching
§6's stated intent.
**Escape hatch:** if Q15 or the delete cost degrades, re-partitioning is a new ADR (`D-19+`),
not a silent change.
**Done:** `ARCH-02` §6 (`AuditLog` and `Message` rows, maintenance paragraph), §4.1 Q15, §8 Q15,
and M11.4 amended.

**R-021 — Option A: the JSON columns *are* the factors. M3.2's model name was wrong.**
Evidence: (a) §1 permits JSON for write-once, non-queried payloads, which is exactly what a
replay snapshot is; (b) M6.1's requirement is *reproduction*, which `featureSnapshot` +
`modelVersion` + `runId` + `disclaimerVersion` already give; (c) M6.5's requirement is
*calibration*, which `ProbabilityRun.calibrationJson` / `sampleSize` / `auc` / `accuracy` /
`baselineAccuracy` already carry per `modelVersion`; (d) the contract's `Assessment` schema
exposes named scores, `riskFlags` and `recommendedNextActions` — no per-feature rows — so a
`TrademarkAssessmentFactors` table would be a contract-visible addition with no consumer.
**Conditions:** both columns stay `Json` (= `jsonb`), `v`-keyed per §1, and carry a comment
that sub-signals are non-probabilistic and are never rendered as a percentage.
If the P6 calibration spike needs *"which feature drove this misprediction"* answered in SQL,
raise ADR `D-19+` **before P6 starts** with the concrete query in hand, plus the contract
change that exposes it — never a table added silently.
**Done:** M3.2 corrected (model name removed).

**R-022 — Option A: the baseline is accepted. ADR D-17.**
"Zero drift" is §7.6 — apply the migrations to a fresh database and assert
`prisma migrate diff` from `schema.prisma` is empty. That test cannot distinguish a baseline
from a delta, and a baseline satisfies M3.2's verification exactly. Manufacturing
`0P0__baseline` + a delta would produce a *fake upgrade path* that the next reviewer would read
as real; §7.2 already allows the honest alternative ("an explicit *irreversible,
restore-from-backup* note").
**Consequences, recorded:**
1. `0P3__p0_3_backlog` is a **baseline**: deploy path is `migrate deploy` against an empty
   database; it must never be applied to a populated one; reversal is
   restore-from-backup. Documented in `docs/runbooks/db-migrations.md` §3.
   The migration is *generated* from `schema.prisma` + fragments (its own header), so
   `schema.prisma` stays the authority and the SQL stays a build artifact — no hand-editing.
2. §5.4's `ALTER COLUMN … TYPE timestamptz(3)` statements are **void** — every instant is
   `timestamptz(3)` from creation, so the 8-hour-of-silence hazard §5.4 was written to prevent
   never opens. The §5.4 *acceptance test* still runs as a test.
3. The next migration is a genuine delta against this baseline and must be named per §7.2.

### 5.2 The nine P1/P2 blockers

**R-001 — No schema change: anonymous results are never rows.**
Your option C is right, but not as a new entity. The contract already decides it:
`TrademarkCreateRequest` **requires** `contactId`, and M8.1's public response is a screening
result — 24-hour cache keyed by normalised mark text + class, no account, no `trademarkId`.
So the funnel stays `site_view → contact_created → magic_link_claimed → order_paid` (M8.4):
a `Trademark` row appears only once a `Contact` exists, and making `contactId` nullable would
weaken a constraint the funnel never needs. The upside for DQ-012/OPEN-09: **the anonymous
path persists nothing**, so it needs no PIPL retention basis and no consent record — funnel
metrics come from the first-party analytics events, not from CRM tables. If P6 ever wants an
auditable anonymous submission record, that is an ADR + migration before P6, not a nullable FK.

**R-002 — Confirmed: unscoped read-only, exactly as `ARCH-01` §5.4 states.**
§5.4 is the single source of truth and gives `EXPERT` "All contacts / leads (unscoped):
read-only". Shipped `contact.read` + `lead.read` matches it. Two conditions: it is read-**only**
(no write, no bulk export), and every unscoped contact read is a privileged read under G8 /
M11.3, so it lands in the audit trail and is searchable by Q15. That audit is the compensating
control for the §1.1 "row-scoping by owner" tension an attorney role creates. The tension is
accepted and recorded; changing it means an ADR, not a code change.

**R-005 — Email, 15 minutes, single use, scope `portal`; storage moves to Postgres (ADR D-18).**
- **Channel: email only.** `MagicLinkRequest.required: [email]` is contract-final. WeCom
  delivery would be a contract change (and can wait for P4+).
- **TTL: 15 minutes**, not 10 — `ARCH-01` §5.1's credential matrix already says "token 15 min"
  and §5.2 already says Redis TTL 900 s. The matrix is the authority; `expiresAt` must be
  `now + 15 min`.
- **Single use, opaque token, ≥ 20 bytes (contract), stored as `tokenHash` only** — never the
  raw token, never logged, never echoed in a response; destroyed after 5 wrong attempts
  (contract and §5.2 agree); rate limits exactly as declared on the operations
  (5/1h per contact, 20/1h per IP; 10/15min per token); `202` neutral body always.
- **Storage conflict, resolved:** §5.2 puts the live token in Redis (`ml:<sha256(token)>`), but
  the shipped `MagicLinkToken` table is the live credential (`tokenHash`, `expiresAt`,
  `consumedAt`, `attempts`, `requestIp`/`requestUa`). **Postgres wins** — see ADR D-18: it
  gives atomic single-use (`UPDATE … WHERE consumedAt IS NULL`), a forensic record of issue and
  redemption, and room for the `pay:<invoiceId>` scope the column comment already anticipates.
  §5.2 is amended in the same change. Consequence you own: expired/consumed rows need a sweep
  job in `worker` (there is already an `@@index([expiresAt])` for it).
- **Scope:** `portal` is the only legal value today. Adding `pay:<invoiceId>` is an
  authz-surface change → ADR + contract change first.

**R-007 — Currency fixed at order creation; rate snapshotted; rails fail closed.**
The contract fixes most of it: `OrderCreateRequest.currency ∈ {USD, CNY, HKD}`, default `USD`,
set once and never re-derived; `Order.displayRateCny` holds the rate snapshot; `Invoice.lines`
is an immutable snapshot at issue time, so a later price or rate change cannot rewrite an
issued invoice. Rules: (1) the invoice is denominated in the order currency; (2) display rows
and the PDF show CNY at `displayRateCny` **with the rate and its `asOf` printed** — no
mid-flight re-quote; (3) all arithmetic in integer minor units (R-019); (4) a rail that cannot
present the order currency is **disabled, never re-priced** — `ENABLE_WECHAT_PAY` already
implements that fail-closed posture for the Alipay/WeChat route.
The remaining sub-question (can those wallets present USD at all?) is **not** an architecture
decision: it rides on **OPEN-01**. Until it is answered the route stays flagged off.

**R-008 — One line item per (mark, Nice class).**
`OrderItem` carries `niceClass`, `quantity ≥ 1`, `unitPrice`, `amount`. So a multi-class filing
is **n line items**, one per class, `quantity = 1` on each (USPTO fees are per class, not a
per-unit quantity); a non-class SKU (flat-fee service) omits `niceClass`. `amount` is computed
in minor units as `unitPrice × quantity`, is the value M3.3's property test reconciles, and is
what M10.3's refund allocation walks in delivery order. Never a single multi-class line: it
would make per-class fees, per-class refunds and per-class office-action reasoning
unrepresentable, which is the whole point of the filing.

**R-010 — No score of any kind is shown before the model gate.**
D-03 forbids a model in Phase 1; the contract's `Assessment` payload is `x-phase: P6 /
PENDING-P6`; M8.1's public screening path is P6. So before M5 the surface is mark intake +
document checklist + "start a conversation" (WeCom/QR) + magic-link claim — **no number, no
percentage, no "likely to register" copy**. Consent is captured when the `Contact` is created,
not at assessment. Consequence for handlers: no P1/P2 handler may write a probability to the
screen or to `Trademark.probabilityScore` outside the §7.7 backfill script.

**R-011 — Flags are rows, flipped by an audited operator action, not by an API.**
The frozen contract exposes no flag operation, so adding one now is a contract change for a
P0 convenience. `FeatureFlag` is the store (`enabled`, `rolloutPercent` as a staff-id hash,
`allowedRoles`, `updatedById`); flipping in production is a `packages/db/scripts/` operator
action executed **as a named staff identity** (MASTER_ADMIN) that writes an `AuditLog` entry —
M11.3 covers configuration changes too. Code reads flags through the one module that owns them
(`ARCH-01` §2.2) with a cache TTL ≤ 60 s. Exposing flag CRUD later = contract change + ADR.

**R-013 — Staff: password + TOTP. Magic links are for clients only.**
Already decided by `ARCH-01` §5.1 (Argon2id password, mandatory TOTP for `EXPERT` /
`MASTER_ADMIN`, 12 h sliding session) and by the contract (`/auth/staff/login`,
`/auth/staff/mfa/verify` vs `/auth/magic-link`, documented as *client* sign-in). No staff magic
link in Phase 1. The only genuinely open part is FA-007 (`SESSION_SECRET` entropy policy), which
stays with DQ-005 until P2.1.

**R-014 — No active 会话存档 consent ⇒ not assignable.**
Fail-closed, exactly like a revoked USPTO credential: assignment eligibility requires
`status = ACTIVE` **and** a current archive consent, checked inside the round-robin
transaction, so a conversation with an unarchived rep is never created. Consent state must be a
**column on the staff row**, not a live WeCom lookup at assign time — assignment runs under
`FOR UPDATE SKIP LOCKED` against a 5-minute SLA, and an external API failure must never resolve
to "assign anyway". When consent lapses the rep leaves the round-robin, `MASTER_ADMIN` is
alerted, and **in-flight assignments are reassigned** to an eligible rep with the handover
audited (a half-archived conversation is the gap this rule exists to prevent). Losing consent
is an operational consequence of the role, not a reason to archive nothing.

**R-015 — Ordering only: no time-zone and no holiday logic in assignment.**
`AssignmentState` already encodes the rule — order by `activeLeads ASC`, tie-break
`lastAssignedAt ASC` (`@@index([activeLeads, lastAssignedAt])`), eligibility from R-014.
Time zone and holidays affect **notification timing and SLA display** (D-14 notification maths
on `responseDeadlineDate`, `Asia/Shanghai` business days), never eligibility: otherwise a lead
arriving at 02:00 CST would find nobody and the 5-minute SLA (M7/D-07) would silently break.
No eligible staff ⇒ lead stays unassigned, `AssignmentState` untouched, alert `MASTER_ADMIN`,
WeCom auto-reply promises a response but **no** SLA. A CN + HK holiday calendar is a
read-only stored list whenever it is needed.

**R-016 — Mechanism ruled now; numbers ship with the P6 endpoint.**
Public screening uses the existing Redis token-bucket route class (`ARCH-01` §11.2) keyed by
**IP** and by **(normalised mark text, class)**, answers `429` on excess, leaks no existence,
and the 24-hour cache (M8.1) doubles as the primary abuse control since identical queries never
reach the model again. The concrete `x-ratelimit` numbers are declared **in the contract when
the endpoint is added at P6** — the contract is the authority for limits, so there is nothing
to invent now. The failure mode this DQ exists to prevent is a bare route appearing without
schema, limit and disclaimer: do not add the endpoint until all three land together.

**R-018 — Topology ruled; region answered (HK), ICP deferred (`.com`).**
Topology: staging is the existing ECS running **only** the three application artifacts from
`infra/compose.staging.yml` (`migrate`, `api`, `web`, `worker`), TLS/WAF/CDN terminated at
Cloudflare, `DATABASE_URL` / `REDIS_URL` pointing at **managed** instances — the compose file
already declares no db/redis services, which is deliberate: it is what keeps D-15 true without
an ADR. No new always-on daemon, and no Terraform for a single VM: IaC is the compose file plus
a documented, idempotent bootstrap script, with secrets from the provider store. Image
provenance and the SSH-key pinning work stay as FA-004 / FA-005 / FA-009.
**Decision (2026-10-11, owner/MD):** staging ECS region = **Hong Kong** (matches `ARCH-01` §3
data residency; no divergence); **ICP not required for now** — unknown for the future, proceed
under the documented default "no ICP-dependent features" and nothing exposed on a `.cn`
hostname; staging hostname = **`.com`**. Region, ICP posture and hostname are recorded in
`ARCH-01` §15 OPEN-05 → RESOLVED and `DQ-018` row. This unblocks M0 evidence once the staging
credentials are provisioned (FA-002).

### 5.3 Judgment calls J-01…J-04 — accepted as shipped

- **J-01 `ck_filing_attended` CHECK — accepted.** G1 becomes a database invariant instead of a
  service-layer guard: defence in depth on a hard compliance rule, with the acceptable cost
  that a hypothetical non-attended filing path needs an ADR plus a migration to open. Record
  the constraint in §5.3 and add a test asserting the CHECK fires.
- **J-02 probability stored `0..1` with a range CHECK — accepted, and it is not really a
  judgment call: it is the contract.** `headlineScore`, `distinctiveScore` and `similarity` are
  all `minimum: 0, maximum: 1`. PRD §3.6.5's "0-100%" is a display format; `%` is applied at the
  edge and never stored.
- **J-03 `lower(email)` functional unique indexes — accepted (BUG-018).** §5's own preamble
  authorises this: items Prisma cannot express live in the migration SQL and are marked `[SQL]`,
  so §7.1 is untouched — Prisma remains authoritative for the *model*, and a functional index
  is an index, not a schema shape. Phone correctly waits for DQ-006: constraining it blind
  would bake in an E.164 assumption before the dedup/merge policy exists. **(DQ-006 ANSWERED
  2026-10-11 — D-20/D-21: dedup now matches on normalised phone; the phone normalisation rule
  can proceed as a `[SQL]` functional unique index.)**
- **J-04 the five tables beyond §5.1 — accepted**, each demanded by a mandate:
  `MagicLinkToken` (contract `/auth/magic-link` + `ARCH-01` §5.1/§5.2), `Refund` (contract
  `Refund`), `RefundAllocation` (M10.3 "allocated across lines"), `WebhookEvent` (M10.2 replay
  and idempotency, `ARCH-01` §11.1), `NotificationPreference` (M9.3 preference writes). Condition:
  `ARCH-02` §5.1 must list them so the package and `schema.prisma` agree (G10) — added in this
  pass as §5.1.1.

### 5.4 Still open after this pass

| Item | Status | What it actually waits for |
| --- | --- | --- |
| DQ-003 | RESOLVED | Option C hybrid: stage distribution derived from `LeadStage` (indexed `contact (stage)`); `SalesMetrics` materialised by (`period`, `salespersonId`) with backfill + staleness alert; no `PipelineStage` table; budget = `Campaign` + order lines (D-23). `M11.2` amended |
| DQ-009 | RESOLVED | Policy-driven refund cut-offs (`USPTO_FEE` until filed-recording, `SERVICE_FEE` until filing), two-step `order.refund.request` → `order.refund` (Master Admin), second approver above **USD 200** (D-22). Closes OPEN-07; contract/schema delta = OPEN-11 |
| DQ-006 | RESOLVED | Person/Company split + temporal M:N + polymorphic mark owner (D-20); never auto-merge, MASTER_ADMIN audited merge (D-21). Schema + mandates `M4.6`/updated `M4.2` recorded; API endpoints = OPEN-10 |
| DQ-012 | RESOLVED (interim) | Option A confirmed: schedule per `ARCH-02` §6 as interim baseline; Art. 47 erasure = pseudonymisation (PII columns nulled, `id` stub + FK edges kept; `Message.content` → `[redacted]` tombstone; `WeComLink` rows deleted; R2 objects deleted); statutory financial/filing + append-only records outrank erasure. Legal basis per class still PENDING PRC counsel (OPEN-09, P2) |
| DQ-017 | RESOLVED | Vendor = AliCloud DirectMail (intl, SG endpoint), `mail.<domain>`, SPF/DKIM/DMARC before first send, email mandatory. Remaining: domain purchase (P1, Ops) + 微信客服 cap confirmation (Tencent) |
| DQ-018 | RESOLVED | ECS region = HK, ICP deferred (`.com`), staging credentials pending (FA-002) |
| OPEN-01, OPEN-04 | OPEN | Payment merchant accounts (none acquired yet; payment implementation deferred behind flags), attorney roster top-up (1 attorney, ≈100 apps/month; support N) |
| OPEN-02, OPEN-03, OPEN-07, OPEN-08 | RESOLVED | Legal review not required (owner); probability cohort = whole LIVE corpus + label = eventual registration + configurable horizon (D-24); refund threshold USD 200 (D-22); release min = ≥ 500 labels + accuracy 95% CI ≤ 5 pp (D-25) |
| OPEN-09, OPEN-10, OPEN-11, OPEN-12 | tracked | PIPL legal basis per class (PRC counsel, P2); Company/merge API surface; refund request/approve schema+contract delta; attorney-profile fields for TEAS pre-fill |
