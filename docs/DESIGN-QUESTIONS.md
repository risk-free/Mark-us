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
| DQ-001 | Anonymous assessment vs. mandatory `Trademark.contactId` | High | P0.1, P5.6 | AWAITING ANSWER |
| DQ-002 | Expert read scope: assigned cases only vs. all | High | P2.1, P7.1, P8.1 | AWAITING ANSWER |
| DQ-003 | `PipelineStage` / `SalesMetrics`: modelled or derived | Medium | P7.3, P7.6 | AWAITING ANSWER |
| DQ-004 | Lint standard & CI parity (`turbo run lint` covers only web) | Low | P0.2, P0.3 | ANSWERED — CLEARED |
| DQ-005 | Magic-link scope model, TTL, delivery channel | High | P2.1, P4.2 | AWAITING ANSWER |
| DQ-006 | Contact identity: dedup / merge policy across channels | Medium | P3.3, P7.1 | AWAITING ANSWER |
| DQ-007 | Invoice currency, FX source and FX lock moment | High | P4.1, P4.3 | AWAITING ANSWER |
| DQ-008 | Order shape for multi-class filings & fee line items | High | P0.1, P4.1 | AWAITING ANSWER |
| DQ-009 | Refund authority & per-line-item refundability | Medium | P4.2, P4.3 | AWAITING ANSWER |
| DQ-010 | What the assessment surface shows before M5 | High | P1, P2, P5 | AWAITING ANSWER |
| DQ-011 | Feature-flag mechanism & who may flip in prod | Medium | P0.3 | AWAITING ANSWER |
| DQ-012 | Retention schedule & PIPL erasure workflow | High | P2, P3, P8.1 | AWAITING ANSWER |
| DQ-013 | Staff auth method for Phase 1 (password vs. staff magic link) | Medium | P2.1 | AWAITING ANSWER |
| DQ-014 | 会话存档 consent capture & non-consented staff | High | P3.4, M3 | AWAITING ANSWER |
| DQ-015 | Round-robin definition: timezone, holidays, no-staff fallback | Medium | P3.5, M3 | AWAITING ANSWER |
| DQ-016 | Anonymous assessment endpoint: abuse & scraping controls | Medium | P5.6 | AWAITING ANSWER |
| DQ-017 | Notification delivery: no transactional-email provider chosen | Medium | P2.5, P3.1 | AWAITING ANSWER |
| DQ-018 | Staging target & IaC: managed cloud vs. Docker-on-VM | High | P0.3, M0 | AWAITING ANSWER |
| DQ-019 | Money precision: `Decimal(12,2)` (ARCH-02 §1) vs `Decimal(14,2)` (M3.3) | High | P4, M3.3 | AWAITING ANSWER |
| DQ-020 | `AuditLog` partitioning conflicts with Prisma's single-field `@id` | High | P7, M11.3 | AWAITING ANSWER |
| DQ-021 | M3.2 names `TrademarkAssessmentFactors`; ARCH-02 §5.1 does not model it | Medium | P6, M6.1 | AWAITING ANSWER |
| DQ-022 | Repository had no baseline migration — `0P3__*` is a full baseline | High | P0.3, M3.2 | AWAITING ANSWER |

---

## 2. Questions

### DQ-001 — Anonymous assessment vs. mandatory `Trademark.contactId`

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** — cheap to fix today, expensive after the baseline migration |
| Blocks | P0.1 data-model sign-off (an M0 criterion), P5.6 public surface |
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

**Issue.** PRD §5.11 promises `Budget/Campaign, PipelineStage, SalesMetrics` entities. The schema has `Campaign` only. `Contact.stage` (a `LeadStage` enum column) and `Lead.status` exist, so pipeline data *could* be derived, but salesperson performance metrics (PRD §3.4.4) and budget tracking (P7.2) have no defined source of truth.

**Why it matters.** Derived queries are always correct and cost nothing to maintain; materialised aggregates are fast but need backfill, staleness handling and a reconciliation story. It also decides whether P7.3 is a 8-md SQL/reporting task or an 8-md pipeline-plus-backfill task.

**Options.** **A** Derive everything at query time (fresh, no ETL, slower on large volumes). **B** Daily materialised aggregates (fast dashboards, backfill job + staleness alert). **C** Hybrid: stage distribution derived, monthly/period metrics materialised.

**Engineering view.** C, decided before P7.3 starts (not blocking now). No schema commitment until then — but the aggregate tables, if chosen, must be designed with a `period` + `salespersonId` key and a backfill job from day one.

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

**Issue.** `Contact.email` and `Contact.phone` are unique but optional; `WeComLink.externalUserId` is unique. Nothing states whether a `Contact` is *one legal person/company* or *one channel identity*. A client who first arrives via 微信客服 (no email, no phone) and later follows up via 客户联系, or who uses two WeChat accounts for the same company, produces duplicates that fragment orders, invoices and document history.

**Options.** **A** Match on `WeComLink` first, then normalised email/phone; never auto-merge — flag a candidate duplicate for Master Admin. **B** Auto-merge with `AuditLog`. **C** Salesperson confirms before merge.

**Engineering view.** A, with an explicit merge operation restricted to Master Admin and fully audited. Related: should `Contact` carry a `legalName`/`company` field separate from the channel-facing `name` (invoices need a legal name; the WeChat contact name is not one)? Please rule on the identity model, because invoices, payment receipts and power-of-attorney documents all depend on it.

---

### DQ-007 — Invoice currency, FX source and FX lock moment

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** |
| Blocks | P4.1 invoice model, P4.3 FX display & reconciliation |
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

**Issue.** `order.refund` is Master Admin only; `InvoiceLineItem.refundable` defaults to `true` for every kind. There is no written refund policy, and no `Refund` entity — while `Payment.status` already anticipates `PARTIALLY_REFUNDED`. Stripe/PayPal refunds are issued against a *charge*, not a line item, so per-line refunds inherently produce multiple provider-side refund objects that our ledger must represent.

**Options.** **A** Policy-driven: refundability derived from `kind` + order status (`USPTO_FEE` non-refundable once filed), request/approve two-step, Master Admin executes, every step audited. **B** Fully manual via provider dashboard, reconciled manually. **C** Automatic on cancellation.

**Engineering view.** A, and I recommend adding a `Refund` table (provider refund id, amount, currency, line item link, actor, reason) so the daily reconciliation job has something to match against — otherwise M4's "webhook/reconciliation success 100%" cannot be evidenced for partial refunds. This is a schema addition; please confirm the policy wording (who may authorise, and the USPTO-fee cut-off) so the rules can be encoded and unit-tested.

---

### DQ-010 — What the assessment surface shows before M5

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **High** |
| Blocks | P1 (site CTA), P2.6, P5 |
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

**Issue.** PRD §6.2/§6.3 and D-04 commit us to PIPL (consent-based collection, minimisation, no client PII to third parties), but no retention schedule exists anywhere in PRD, ARCHITECTURE or the schema. Open items: retention per data class (client documents and OCR text, archived WeChat messages, anonymous assessment submissions, audit logs, invoices, raw USPTO archives — 7 days is stated for the latter only); how a PIPL Art. 47 erasure request is fulfilled given that invoices, payments and audit logs must be retained for accounting/legal reasons; and whether erasure is deletion, anonymisation, or soft-delete.

**Why it matters.** Deletion semantics touch every table's foreign keys and the "row-level scoping" security controls (ARCHITECTURE §6). This is also the kind of finding an external reviewer or a client will test directly. It also feeds DQ-001 (anonymous submissions) and DQ-014 (archived messages).

**Options.** **A** Documented retention matrix + scheduled purge worker (BullMQ), with `deletedAt` soft-delete on `Contact` and hard deletion of dependent content. **B** Manual-only, by policy. **C** Per-record TTL columns.

**Engineering view.** A: a `retention` config module + a `purge` queue, and a written matrix (data class × retention × deletion mode) that QA can test against. Requesting the matrix is the ask — the retention periods themselves are a business/legal decision I should not invent.

---

### DQ-013 — Staff auth method for Phase 1

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P2.1 |
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

**Issue.** P5.6 plans a *public* assessment API, anonymous by design (DQ-001). Unstated: rate limits, bot mitigation, and whether the endpoint may be used to enumerate our USPTO-derived index (which would be a redistribution of USPTO data under our own terms). The 24h result cache (PRD §3.6.8) also bounds cost only for *repeat identical* queries; a scraper varying goods/services strings defeats it.

**Options.** **A** Redis sliding-window rate limit per IP + a self-hosted challenge after a threshold, cache key normalisation, and per-request cost metering with an alert on spend. **B** Gate the tool behind the WeCom contact step (lead capture first). **C** Both.

**Engineering view.** A, with C as the fallback if abuse materialises. Note that a mainland-reachable challenge provider must be chosen deliberately (D-04's GFW/mainland-access sensitivity applies to the marketing edge). Please confirm whether the tool is open to all visitors or lead-gated from day one — that decision also changes DQ-001 and DQ-010.

---

### DQ-017 — Notification delivery: no transactional-email provider chosen

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 16:57 CST |
| Severity | **Medium** |
| Blocks | P2.5, P3.1, P4.2 (payment links) |
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

**Issue.** ARCHITECTURE §4.3 assumes magic links are delivered "via WeCom message or email", PRD §2/§3.2.5 assume status notifications, and `NotificationChannel` is `WECHAT | EMAIL | PORTAL` — but no mail provider appears in `.env.example` and no decision was recorded. Related open point: the current documented limits on proactive outbound messages through 微信客服 (believed to be time-boxed relative to the customer's last inbound message) need confirming with Tencent, because invoice/payment reminders depend on being able to message a client who has not spoken to us that day.

**Why it matters.** Notification delivery is on the critical path for the client's most important events (payment link, status change, OA deadline) and for the 5-minute assignment notification to sales staff. If WeCom cannot push proactively, email becomes mandatory rather than optional, which changes P2.5 effort and adds a vendor dependency (and a PIPL sub-processor to document, per ARCHITECTURE §6).

**Options.** **A** WeCom message as primary, email as fallback (requires a provider decision). **B** Portal-only notifications, staff notified in-app. **C** Add an SMS/WeCom-app channel for deadlines.

**Engineering view.** A, with the provider and sending domain decided as a business-side prerequisite alongside the WeCom certification (DECISIONS.md business prerequisites table). Please confirm who owns the vendor decision, and whether a self-hosted relay (e.g. an existing HK SMTP/transactional service) is acceptable under D-04's sub-processor rules.

---

### DQ-018 — Staging target and IaC: managed cloud vs. Docker-on-VM

| Field | Value |
|---|---|
| Raised by | Developer (full-stack) |
| Raised at | 2026-09-27 18:05 CST |
| Severity | **High** |
| Blocks | P0.3 completion, M0 ("pipeline deploys green to staging") |
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| Status | AWAITING ANSWER |
| Discussion | — |
| Answered by | — |
| Answered at | — |

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
| FA-009 | DQ-018 | Confirm the HK region's Node runtime and base image (Node 20 reaches EOL during the project; plan the 22+ upgrade) | Architect | P8.1 | OPEN |

*New actions are appended here when an answer creates follow-up work (schema change, doc update, migration note).*

---

## 4. Change log

| Date (CST) | Change | By |
|---|---|---|
| 2026-09-27 16:57 | Created. Seeded DQ-001…DQ-004 from the P0 scaffold review; DQ-005…DQ-017 added from the same pass over PRD v2.0 / ARCHITECTURE / SCHEDULE. All `AWAITING ANSWER`. | Developer (full-stack) |
| 2026-09-27 18:05 | DQ-004 answered (option A) and implemented as part of P0.2/P0.3 hardening. DQ-018 raised for the staging target / IaC decision. Follow-up actions FA-001…FA-006 opened. | Developer (full-stack) |
| 2026-09-29 01:03 | Reviewed the architecture of record (`docs/architecture/*`) and implemented mandates M1.1, M1.6, M2.1, M3.1, M3.2. Raised DQ-019 (money precision), DQ-020 (audit partitioning), DQ-021 (assessment factors), DQ-022 (no baseline migration existed). FA-001 answered: DQ-001/DQ-008 are **not** blocking the schema, because the P0.3 backlog is orthogonal to both; they still block the P1 handlers that use them. | Developer (full-stack) |
