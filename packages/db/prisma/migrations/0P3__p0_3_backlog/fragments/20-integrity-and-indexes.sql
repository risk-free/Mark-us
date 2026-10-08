-- Integrity constraints, idempotency/dedupe indexes, BRIN, autovacuum.
-- Concatenated after the generated baseline DDL by
-- packages/db/scripts/build-baseline-migration.mjs — edit here, never in migration.sql.
--
-- LOCK LEVEL: ACCESS EXCLUSIVE on catalog objects only. This is a baseline
-- migration against an empty database: no table holds rows, so there is no
-- rewrite, no table copy and no long-lived lock.
--
-- ROLLBACK: irreversible as a script. This is the baseline, so rollback is
-- `DROP SCHEMA public CASCADE` + `prisma migrate reset` on a scratch database,
-- or restore-from-backup on a real one. Nothing here destroys pre-existing data
-- because nothing pre-exists. See docs/runbooks/db-migrations.md.

-- ---------------------------------------------------------------------------
-- Integrity constraints (ARCH-02 §5.3)
-- ---------------------------------------------------------------------------
ALTER TABLE "Order"             ADD CONSTRAINT ck_order_nonneg    CHECK ("subtotal" >= 0 AND "total" >= 0);
ALTER TABLE "InvoiceLineItem"   ADD CONSTRAINT ck_line_positive   CHECK ("unitAmount" > 0 AND "quantity" > 0);
ALTER TABLE "InvoiceLineItem"   ADD CONSTRAINT ck_line_refund     CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "unitAmount" * "quantity");
ALTER TABLE "Invoice"           ADD CONSTRAINT ck_invoice_nonneg  CHECK ("subtotal" >= 0 AND "total" >= 0);
ALTER TABLE "Payment"           ADD CONSTRAINT ck_pay_nonneg      CHECK ("amount" > 0);
ALTER TABLE "Refund"            ADD CONSTRAINT ck_refund_nonneg   CHECK ("amount" > 0);
ALTER TABLE "RefundAllocation"  ADD CONSTRAINT ck_refund_alloc    CHECK ("amount" > 0);
ALTER TABLE "Campaign"          ADD CONSTRAINT ck_campaign_nonneg CHECK ("budget" >= 0 AND "spent" >= 0);

-- Probability is stored 0..1 and rendered as a percentage by the API layer
-- (PRD §3.6.5's "0–100%" is a presentation scale, not a storage scale).
ALTER TABLE "TrademarkAssessment" ADD CONSTRAINT ck_score_range CHECK ("pRegistration" >= 0 AND "pRegistration" <= 1);
ALTER TABLE "Trademark"           ADD CONSTRAINT ck_score_range CHECK ("probabilityScore" IS NULL OR ("probabilityScore" >= 0 AND "probabilityScore" <= 1));
ALTER TABLE "TmSimilarity"        ADD CONSTRAINT ck_similarity_range CHECK ("score" >= 0);

-- Filing is attended; no unattended method may ever be recorded (D-01, G1).
ALTER TABLE "Application" ADD CONSTRAINT ck_filing_attended CHECK ("filingMethod" = 'ATTENDED');

-- Magic links are single-use, hashed, and always expire (D-06).
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT ck_magiclink_expiry CHECK ("expiresAt" > "createdAt");

-- Outbox payloads are schema-versioned (ARCH-02 §1).
ALTER TABLE "OutboxEvent"  ADD CONSTRAINT ck_outbox_payload_version CHECK ("payload" ? 'v');
ALTER TABLE "Notification" ADD CONSTRAINT ck_notification_key        CHECK (length("idempotencyKey") > 0);

-- ---------------------------------------------------------------------------
-- Idempotency and dedupe indexes (ARCH-02 §4.1 Q4, Q9, Q11, Q16, Q17)
-- ---------------------------------------------------------------------------
-- Payment webhook dedupe: a replayed delivery is a no-op (ARCH-01 §11.1, M10.2).
CREATE UNIQUE INDEX ux_payment_provider_event
  ON "Payment" ("providerEventId") WHERE "providerEventId" IS NOT NULL;

-- 会话存档 delivers at least once; the same msgid may arrive N times (M4.2).
CREATE UNIQUE INDEX ux_message_wecom
  ON "Message" ("conversationId", "wecomMsgid") WHERE "wecomMsgid" IS NOT NULL;

-- One conversation per WeCom session, so an archive replay cannot fork history.
CREATE UNIQUE INDEX ux_conversation_wecom_session
  ON "Conversation" ("channel", "wecomSessionId") WHERE "wecomSessionId" IS NOT NULL;

-- TSDR/ODP office-action upsert is idempotent on its natural key (Q9).
CREATE UNIQUE INDEX ux_office_action_key
  ON "OfficeAction" ("applicationId", "usptoActionCode", "responseDeadline");

-- Settlement matching reads only successful payments (Q12).
CREATE INDEX ix_payment_succeeded_created
  ON "Payment" ("createdAt") WHERE "status" = 'SUCCEEDED';

-- Outbox relay polls only unpublished rows (Q16).
CREATE INDEX ix_outbox_unpublished
  ON "OutboxEvent" ("id") WHERE "publishedAt" IS NULL;

-- Vault reads are the highest-value audit query (Q17).
CREATE INDEX ix_audit_vault
  ON "AuditLog" ("createdAt" DESC, "actorId") WHERE "action" LIKE 'VAULT_%';

-- AuditLog is append-only and grows without bound: BRIN keeps range scans cheap
-- at a fraction of a B-tree's size (Q15).
-- NOTE: monthly RANGE partitioning (ARCH-02 §6) is deliberately NOT applied here.
-- A partitioned table must carry the partition key in its primary key, which
-- Prisma cannot express for a single-field @id, so partitioning and "Prisma is
-- the only schema authority" (ARCH-02 §7.1) are in direct conflict. Escalated as
-- DQ-020 rather than improvised; BRIN + autovacuum is the interim mitigation.
CREATE INDEX ix_audit_created_brin ON "AuditLog" USING BRIN ("createdAt");

-- ---------------------------------------------------------------------------
-- Corpus search (ARCH-02 §4.1 Q7, §4.2.4) — the P5 critical path.
-- Trigram GIN, never ILIKE '%…%'. Class narrowing goes through TmCorpusMarkClass,
-- which is indexed on classId in the generated DDL.
-- ---------------------------------------------------------------------------
CREATE INDEX ix_corpus_normalized_trgm
  ON "TmCorpusMark" USING GIN ("normalizedText" gin_trgm_ops);

-- CRM tag filters: a String[] needs GIN or every filter is a sequential scan.
CREATE INDEX ix_contact_tags ON "Contact" USING GIN ("tags");

-- ---------------------------------------------------------------------------
-- Identity normalisation (BUG-018). Email identity is case-insensitive: a plain
-- @unique lets `Admin@x.com` and `admin@x.com` become two staff accounts or two
-- clients. Phone is normalised to E.164 in the Zod layer rather than constrained
-- here, because the format policy belongs to DQ-006.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX ux_staff_email_lower   ON "StaffUser" (lower("email"));
CREATE UNIQUE INDEX ux_contact_email_lower ON "Contact" (lower("email")) WHERE "email" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Autovacuum tuning for high-churn tables (ARCH-02 §4.2.5). Hot-update bloat on
-- append-only tables is a known failure mode.
-- ---------------------------------------------------------------------------
ALTER TABLE "Message"      SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE "Payment"      SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE "AuditLog"     SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE "OutboxEvent"  SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE "Notification" SET (autovacuum_vacuum_scale_factor = 0.02);
