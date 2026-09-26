# Product Requirements Document (PRD)
## US Trademark Application Platform

*Version 2.0 | Created: 2026-09-25 | Updated: 2026-09-26 | Status: Reviewed & Approved*
*Supersedes v1.0. Decision rationale for every change: `docs/DECISIONS.md` (D-01…D-14).*

---

## 1. Overview

### 1.1 Problem Statement
Cross-border e-commerce sellers in China need a streamlined way to apply for US trademarks with the USPTO. Our team of dual-qualified attorneys (PRC lawyers with US bar qualifications, e.g., California) provides the qualification, know-how, and experience to file and prosecute applications. Each attorney files through **their own USPTO.gov account** — accounts are firm-internal, never shared with clients or external parties; the platform provides an encrypted credential vault and assisted-login workflow (D-01). Clients currently lack a centralized digital platform to manage the process, upload documents, track application status, and make payments securely.

### 1.2 Business Goals
- **Marketing**: GEO/SEO-friendly website, multilingual (Simplified Chinese default, English, Traditional Chinese)
- **Operations**: Portal/OA system for document management and application tracking (magic-link access, **no client registration**)
- **Sales**: WeCom-based lead operations — 微信客服 queue + 客户联系 + 会话存档 supervision, AI-assisted qualification and assignment
- **Management**: ERP dashboard for budget allocation, pipeline, salesperson management, after-sale monitoring
- **Payment**: Online payments via Stripe HK (cards, Apple/Google Pay, mainland Alipay, mainland WeChat Pay) + PayPal; itemized invoices
- **AI Assessment**: Probability of trademark approval with AI-driven suggestions, legally-honest metrics and disclaimers

### 1.3 Success Metrics *(rewritten — D-07)*
**Website / funnel**
- >500 monthly visitors (floor, Phase 1–3)
- Visitor → WeChat contact **≥3%** (all visitors); chat-open → contact **≥30%** (engaged visitors) — recalibrate after first 500 visitors

**WeCom / chat**
- New contact → tagged + assigned ≤5 min (median, business hours)
- Bot deflection rate **≥60% at M2, ≥70% at M3** — *deflection = session closed by bot without human takeover AND no customer re-ask within 24h*

**Portal**
- ≥90% document upload success rate; real-time status tracking

**Payments**
- Payment link opened → paid **≥70%**; webhook/reconciliation success 100%
- All agreed rails live with one real successful transaction each (see §8 M6)

**AI assessment** *(defined in D-03)*
- M2 gate: AUC-ROC ≥0.70 on temporal hold-out; accuracy ≥70% AND ≥+10pp over majority baseline; calibration ±10pp within 20-pp buckets
- Phase-3 stretch: accuracy >80% (not a gate)
- No accuracy claims in marketing until validated

**NFRs** *(right-sized — D-07)*: design load **100 concurrent / ~10k MAU**; API <500ms; USPTO jobs <10s; page load <3s

---

## 2. User Roles & Permissions *(rewritten — D-06)*

**No public registration exists. All staff accounts are provisioned by the Master Admin. Clients are not users — they are `Contact` records with magic-link portal access.**

| Role | Description | Key Permissions |
|------|-------------|----------------|
| **Master Admin (= Managing Director)** | Single role; the IT head. Creates/manages all staff accounts | Staff lifecycle (create/disable/role), RBAC config, ERP (budget, pipeline, reassignment, CS/complaints), full audit visibility |
| **Expert** | Dual-qualified attorney (PRC + US bar) | Credential vault (own USPTO account only, own MFA), upload/forms, auto-fill, auto-proofread, file applications (personal signature), manage assigned cases, status tracking |
| **Salesperson** | Account executive | Operates from WeCom; view assigned contacts/leads, respond in 微信客服 queue, update pipeline, create magic-link portal access |
| **Contact (client)** | *Not a login role* | Magic-link token sessions only: upload documents, view status, pay invoices, view assessment results |

Assignment: automatic **round-robin** into the salesperson queue → **Master Admin override/reassign**. Clients never choose salespeople.

RBAC enforced in route middleware **and** at API level (§6.2).

---

## 3. Feature Modules

### 3.1 Website (Marketing Frontend)
- **3.1.1**: GEO/SEO-optimized pages (Home, About, Services, Case Studies, Blog)
- **3.1.2**: Multilingual via **next-intl** (zh-CN default, en, zh-TW) — *D-11*; IP-based detection + user preference persistence
- **3.1.3**: Mobile-responsive design (Tailwind CSS, all device breakpoints)
- **3.1.4**: Structured data, meta tags, sitemap, robots.txt
- **3.1.5**: WeChat contact entry points (QR / 微信客服 link) as primary CTA; optional website AI chat widget for EN/overseas visitors

### 3.2 Portal/OA System *(rewritten — D-06)*
- **3.2.1**: **No registration.** Staff accounts provisioned by Master Admin; client access via **magic links** (staff creates Contact → secure one-time link → token session)
- **3.2.2**: Secure document upload (PDF/IMG) with version control, encryption at rest (R2/S3)
- **3.2.3**: OCR text extraction (background job; PaddleOCR/cloud for zh) — *D-13*
- **3.2.4**: Auto-proofreading (LanguageTool for EN + punctuation; LLM suggestions for deeper rewrites) — *D-13*
- **3.2.5**: Application progress/status check (TSDR-backed)
- **3.2.6**: Document editing and collaboration *(scoped: expert-side annotation + versioned replacement; no real-time co-editing)*

### 3.3 Sales Operations via WeCom *(replaces v1 website chatbox — D-06)*
- **3.3.1**: **微信客服 (WeChat Customer Service)** as inbound lead channel — official session APIs (create/assign/close, waiting queue); AI welcome flow + query resolution via LLM gateway + USPTO knowledge base
- **3.3.2**: **客户联系 (WeCom external contacts)** — assigned salesperson adds client's WeChat as friend from WeCom; client experience unchanged; departing-staff customer reassignment
- **3.3.3**: **会话存档 (Conversation Archive API)** over both channels — server-side archiving of all message types (incl. deleted/recalled), dual-side consent notice built in (PIPL-compliant) → synced to `Conversation`/`Message`
- **3.3.4**: Lead capture (name, contact, trademark interest) + tagging/filtering (class, interest, geography)
- **3.3.5**: Round-robin salesperson assignment queue; Master Admin reassigns
- **3.3.6**: Complex query escalation to human salesperson (bot → human handoff <1 min)
- **3.3.7**: Personal-WeChat bots and QQ automation are **out of scope** (ToS violation risk)

### 3.4 ERP Management Dashboard
- **3.4.1**: Master Admin-only access (RBAC); staff user management (create/disable/role)
- **3.4.2**: Marketing budget allocation (per campaign/channel)
- **3.4.3**: Pipeline visualization (Kanban/funnel view)
- **3.4.4**: Salesperson performance metrics
- **3.4.5**: After-sale monitoring (case tracking, SLA timers + breach alerts)
- **3.4.6**: CS & complaints handling (ticket system, resolution tracking, satisfaction score)

### 3.5 Online Payment Gateway *(rewritten — D-05)*
- **3.5.1**: **Stripe HK** (Phase 1): Visa/MasterCard/Amex + Apple/Google Pay + **mainland Alipay + mainland WeChat Pay** — single integration; Stripe-hosted QR/redirect flows; Stripe Elements (no card data on server, PCI-DSS SAQ-A)
- **3.5.2**: **PayPal** (Phase 2/3)
- **3.5.3**: **Itemized invoices**: platform service fee vs. USPTO government fees as separate line items; PDF invoice (zh/en); refund logic per line item
- **3.5.4**: Currency: **USD base pricing** + live **CNY display conversion**; settlement HKD/USD to HK bank (CNY is presentment only)
- **3.5.5**: **Out of scope / deferred**: HSBC PayMe & FPS (HK retail methods), AlipayHK & WeChat Pay HK wallets (separate acquiring; revisit via Alipay+ if HK/SEA segment grows), UnionPay (deferred, needs separate acquirer)
- **3.5.6**: Webhooks: idempotent handlers (Stripe/PayPal), reconciliation jobs

### 3.6 Trademark Approval Probability Tool *(rewritten — D-02, D-03)*
- **3.6.1**: User submits trademark (text first; **image/logo scoring deferred**) + class selection
- **3.6.2**: **Data source = official, no scraping**: daily Trademark bulk XML download → local Postgres index; status checks via **TSDR API**
- **3.6.3**: **Corpus = LIVE only (pending + registered)**; dead marks excluded (~55% storage saved)
- **3.6.4**: Similarity scoring: `pg_trgm` + normalized/phonetic matching + class adjacency (Option **A1 lean**; A2 OpenSearch / A3 BGE embeddings documented as upgrades, not built)
- **3.6.5**: **One headline score**: P(eventual registration) 0–100% — plus non-probabilistic **sub-signals**: top similar live marks, class-fit warnings, descriptiveness flags
- **3.6.6**: Suggestion engine (via LLM gateway): class adjustment, wording tweaks, color/image modification ideas, combined proposals
- **3.6.7**: **Mandatory disclaimers** on every result (zh-CN/en/zh-TW): not legal advice, not a guarantee, examiner discretion applies, attorney review available
- **3.6.8**: Result caching 24h (bulk data refresh cycle); score generation p95 <10s
- **3.6.9**: Evaluation (per D-03): decided cohort 2021–2023 (registered vs abandoned; pending excluded), temporal hold-out, AUC + accuracy-vs-baseline + calibration; OA-reason labels from 5–10K TSDR-sampled office actions, LLM-classified with attorney spot-check

---

## 4. Key Workflows

### 4.1 Client Onboarding Workflow
```
1. Website visit → multilingual landing page (zh-CN default)
2. "Assess Your Trademark" → submit trademark + class (anonymous allowed)
3. AI assessment → probability score + sub-signals + suggestions + disclaimer
4. Contact via WeCom CTA → client adds salesperson (微信客服 or 客户联系)
5. AI lead qualification → round-robin assignment ≤5 min → salesperson follow-up
6. Salesperson creates Contact → magic-link portal access (no registration)
7. Document upload → OCR + auto-proofread (background jobs)
8. Payment → itemized invoice → Stripe (cards/Alipay/WeChat) or PayPal
9. Expert review → attorney signs & files via own USPTO account (assisted login, own MFA)
10. Status tracking → portal dashboard (TSDR-backed)
11. Post-application → after-sale monitoring, SLA, CS tickets
All conversations archived via 会话存档 (consented) → ERP supervision
```

### 4.2 Lead Management Workflow
```
1. Visitor → WeCom entry (QR / 微信客服 / website widget)
2. AI welcome + qualification; tags captured (class, interest, geography)
3. Lead enters round-robin queue → auto-assigned ≤5 min
4. Master Admin can reassign/override
5. Salesperson follows up in WeCom (客户联系 for assigned clients)
6. Conversion → Contact + magic-link portal access (no account creation)
7. All chats archived → Conversation/Message → ERP dashboards
```

### 4.3 Application Prosecution Workflow
```
1. Expert receives new client case
2. Auto-fill forms from Contact data + OCR text
3. Auto-proofread Chinese/English content (LanguageTool + LLM)
4. Attorney personally signs & submits to USPTO (own account, own MFA, no shared credentials)
5. Track application status via official TSDR API (or manual check)
6. Client receives status updates via portal + notification
7. Respond to USPTO office actions (deadline tracking + reminders)
8. Post-registration monitoring & CS handling
```

---

## 5. Data Model (Core Entities) *(extended — D-09; full schema: `packages/db/prisma/schema.prisma`)*

### 5.1 StaffUser (was "User")
- id, name, email, role (MASTER_ADMIN | EXPERT | SALESPERSON), locale, timezone, status, created_at, updated_at
- USPTO credential vault entry (encrypted password; **never MFA seed**), USPTO account linkage
- WeCom member linkage (userid)

### 5.2 Contact *(new — replaces client-as-user)*
- id, name, email, phone, wechat_alias, wecom_external_userid, locale, tags[], status, assigned_salesperson_id, created_at, converted_at
- magic-link token hashes (single-use, expiring), consent records

### 5.3 Trademark
- id, contact_id, title, description, class_id, goods_services, image_text, status
- filing_date, registration_number, probability_score, probability_model_version
- version history, ocr_text, proofread_status

### 5.4 Application
- id, trademark_id, filing_basis, filing_date, status, serial_number
- uspto_correspondence, office_actions, response_deadline, next_reminder_at
- expert_assigned_id, created_at, updated_at

### 5.5 Order / Invoice + LineItems *(new — itemized invoices, D-05)*
- Order: id, contact_id, status, currency, subtotal, total, created_at
- InvoiceLineItem: id, order_id, description, kind (SERVICE_FEE | USPTO_FEE | OTHER), unit_amount, quantity, refundable
- Invoice: PDF render (zh/en), number sequence, issued_at, due_at, paid_at

### 5.6 Payment
- id, order_id, contact_id, amount, currency, provider (STRIPE | PAYPAL), method (CARD | ALIPAY | WECHAT | PAYPAL | ...), status, transaction_id, webhook_events (idempotency ledger)
- created_at, paid_at, refunded_at

### 5.7 Conversation + Message *(replaces bare ChatLog — D-06/D-09)*
- Conversation: id, contact_id, channel (WECOM_KF | WECOM_CONTACT | WEB_WIDGET), assigned_salesperson_id, status, sentiment, resolved, archived (会话存档 ref)
- Message: id, conversation_id, direction, content_type, content, wecom_msgid, created_at

### 5.8 Lead/Tag
- id, source, contact_id, tags (class, interest, geography), status, assigned_salesperson_id, created_at, converted_at

### 5.9 Document + DocumentVersion *(new)*
- Document: id, contact_id, trademark_id?, filename, kind, current_version, status, created_at
- DocumentVersion: id, document_id, version_no, storage_key (R2/S3), size, checksum, ocr_text, proofread_status, uploaded_by, created_at

### 5.10 CS Ticket
- id, contact_id, type, status, severity, description, resolution, resolved_at, satisfaction_score, sla_due_at

### 5.11 Support entities *(new)*
- **AuditLog**: id, actor_id, action, entity_type, entity_id, metadata, ip, created_at (incl. every credential-vault retrieval)
- **Notification**: id, user_id/contact_id, channel, template, payload, status, sent_at
- **ConsentRecord**: id, subject (staff|contact), kind (SESSION_ARCHIVE | PIPL_PRIVACY | MARKETING), granted, evidence, created_at
- **WeComLink**: id, contact_id, external_userid, channel, verified_at
- **Budget/Campaign, PipelineStage, SalesMetrics**: ERP aggregates (see ARCHITECTURE.md)

---

## 6. Non-Functional Requirements

### 6.1 Performance
- Page load <3s on slow mobile networks; Lighthouse perf ≥90
- API response <500ms for core operations
- USPTO ingest/scoring jobs complete within 10 seconds (query); daily ingest within minutes
- Design load: **100 concurrent / ~10k MAU** *(right-sized from 1000+ — D-07)*

### 6.2 Security
- PCI-DSS via Stripe Elements (no card data on server)
- **PIPL** data handling (replaces GDPR — D-04): consent-based collection, PIPL privacy policy, no client PII to third parties; PRC counsel confirms cross-border posture
- USPTO credential vault: envelope encryption (KMS), per-attorney access only, **MFA seeds never stored**, full audit log
- RBAC at middleware **and** API level; magic-link tokens single-use + expiring
- Document storage encrypted at rest; malware scan on upload
- Dual-side consent handling for 会话存档 (built-in notices + ConsentRecord)

### 6.3 Compliance
- USPTO e-file format requirements; attorney personal signature on filings
- **`.cn`/ICP compliance deferred** (out of scope until mainland hosting is chosen — D-04)
- Multi-jurisdictional trademark law accuracy — disclaimers on all assessments
- Payment provider regulatory compliance (Stripe/PayPal HK terms; Alipay/WeChat cross-border rules)

### 6.4 i18n
- zh-CN default; en; zh-TW — next-intl; IP-based detection + user preference persistence
- USD base pricing + CNY display conversion

### 6.5 Reliability
- 99.9% uptime target; automated daily backups
- BullMQ queue for long-running jobs (OCR, ingest, archive sync, LLM calls)
- Graceful degradation for API dependencies (WeCom/USPTO/LLM circuit breakers)

---

## 7. Tech Stack *(final — D-11/D-12/D-13/D-14)*

### 7.1 Frontend
- **Next.js 15+ (App Router), TypeScript, Tailwind CSS, shadcn/ui**
- **next-intl** (zh-CN/en/zh-TW)
- **React Query only** (SWR dropped)
- Charts: Recharts or ECharts (ERP)

### 7.2 Backend
- **Single TypeScript monorepo** (pnpm workspaces + Turborepo)
- **Hono** (Node 20+) API; route handlers where co-located with Next.js
- **PostgreSQL + Prisma**; Prisma Migrate
- **Auth**: staff JWT (role claims) + magic-link client sessions; admin-provisioned accounts only (NextAuth optional for staff SSO later)
- **File storage**: Cloudflare R2 / S3 (encrypted, presigned uploads)
- **Queues**: BullMQ + Redis
- **OCR**: PaddleOCR or cloud OCR (zh) · **Proofreading**: LanguageTool + LLM gateway
- **Testing**: Jest + React Testing Library + Playwright (pytest dropped)

### 7.3 AI/LLM
- **LLM gateway** (OpenAI-compatible abstraction, model-per-task, swappable): DeepSeek / GLM / Kimi K3 (China-based, international endpoints) — *D-04*
- **Embeddings**: self-hosted **BGE** (open weight; no vendor dependency)
- Similarity: Postgres `pg_trgm` + normalized/phonetic + (later) vector cosine
- Caching: Redis (probability scores, 24h TTL)

### 7.4 Integrations
- **WeCom**: 微信客服 APIs (sessions/assignment/chat logs), 客户联系 (external contacts), 会话存档 (archive ingest)
- **Payments**: Stripe HK (cards/Apple Pay/Alipay/WeChat) + PayPal; webhook idempotency
- **USPTO**: daily bulk XML (ODP/BDSS) + TSDR API (API key); no scraping
- Website analytics: self-hosted **PostHog or Umami** + **Sentry** (no Google Analytics)

### 7.5 DevOps
- **GitHub Actions** CI/CD → Docker → staging/prod; feature flags for gated releases
- Deployment: marketing static site on Vercel/Cloudflare (mainland-reachable CDN); **API + workers + DB in HK region**; swap CDN if mainland access flaky
- Infrastructure as code; daily backups; resource/cost dashboards (uptime, latency p95, error rate, queue depth, DB/CPU/mem, per-module cost)

### 7.6 Removed
- **Rust/WASM**: dropped — no justified hotspot (D-14)
- FastAPI/Python backend, SWR, pytest, next-i18next: dropped (D-11/D-12)

---

## 8. Phases & Milestones *(replaced by man-day schedule — D-08; full plan: `docs/SCHEDULE.md`)*

| Gate | Criteria | Phase |
|------|----------|-------|
| **M0** | CI/CD pipeline deploys green to staging; monitoring/alerting live | P0 Foundation & DevOps |
| **M1** | Website live on prod domain, 3 locales, Lighthouse SEO ≥90 | P1 Marketing Website |
| **M2** | E2E portal: provision → magic link → upload → OCR → status | P2 Client Portal |
| **M3** | WeChat lead → auto-assign ≤5 min → archived (consented) | P3 WeCom Lead Ops |
| **M4** | Real transaction per payment rail + itemized invoice verified | P4 Payments |
| **M5** | Probability model gates met (AUC ≥0.70, ≥+10pp baseline) + disclaimers live; bot deflection ≥60% | P5 AI Probability + P6 LLM/Chatbot |
| **M6** | Master Admin operates ERP end-to-end (budget, pipeline, tickets) | P7 ERP Dashboard |
| **M7** | Production release signed off after UAT (one real case, attorney + client) | P8 Hardening & Release |

- Effort: engineering ≈ **262 man-days** (±20%), all-hands ≈ 320 md; ≈18–20 calendar weeks @ 3 devs, Wave-parallelized
- Style: **Waterfall phase gates + continuous CI/CD within phases**; no contractual deadline (self-use product)

---

## 9. Appendices

### 9.1 Glossary
- **RBAC**: Role-Based Access Control
- **TSDR**: Trademark Status and Document Retrieval (USPTO API)
- **ODP**: USPTO Open Data Portal (bulk data + APIs; sign-in + MFA required since 2026-06-18)
- **WeCom**: 企业微信 (Tencent enterprise messenger; connects to personal-WeChat users)
- **微信客服**: WeChat Customer Service — official multi-agent service channel with session APIs
- **客户联系**: WeCom external-contacts feature (staff add clients' WeChat)
- **会话存档**: WeCom Conversation Archive API (compliant chat supervision, dual-side consent)
- **OCR / SLA / PCI-DSS / PIPL**: Optical Character Recognition / Service Level Agreement / Payment Card Industry standard / PRC Personal Information Protection Law

### 9.2 Assumptions
- Firm's USPTO TSDR/ODP API access via one firm account (API key; ODP profile fields complete)
- Ground truth for probability model = USPTO final status of decided 2021–2023 filings; similarity features computed against current corpus (documented limitation)
- Search corpus = live marks only (pending + registered); dead marks excluded by design
- Clients keep personal WeChat; staff operate from WeCom (mandatory for supervision)
- HK entity accepts payments; Stripe HK + PayPal approved for HK entities
- China-based LLM APIs (DeepSeek/GLM/Kimi) available and compliant for our use
- PRC counsel confirms PIPL cross-border posture for HK-hosted processing

### 9.3 Out of Scope
- Personal-WeChat/protocol automation and QQ supervision (ToS violation — D-06)
- `.cn` domain / ICP filing / mainland hosting (deferred)
- PayMe, FPS, AlipayHK, WeChat Pay HK wallets, UnionPay (D-05)
- Logo/image similarity scoring (later increment; text first)
- OpenSearch (A2) and embeddings (A3) indexes — documented upgrades, built only on quality trigger
- Full USPTO e-file *protocol* automation (attorney-in-the-loop filing via assisted login)
- Multi-language document translation workflow
- Custom AI model training; mobile native apps; Rust/WASM (D-14)

### 9.4 Future Considerations
- Logo scoring (design codes already indexed; on-demand image fetch via TSDR)
- Alipay+ gateway for HK/SEA wallets; UnionPay acquiring
- Mainland hosting + ICP + `.cn` (if market demands)
- CTMO (China Trademark Office) integration; public API for partners; predictive trend analytics

---

*PRD v2.0. Reviewed 2026-09-26. Decision rationale: docs/DECISIONS.md. Schedule: docs/SCHEDULE.md. Architecture: docs/ARCHITECTURE.md.*
