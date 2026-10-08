-- Extensions and public-number sequences (ARCH-02 §1, §4.2.4).
-- Concatenated after the generated baseline DDL by
-- packages/db/scripts/build-baseline-migration.mjs — edit here, never in migration.sql.

-- unaccent is applied at INGEST time to compute TmCorpusMark.normalizedText.
-- It is deliberately not used inside an index predicate: unaccent is only
-- STABLE, not IMMUTABLE, so an index built on top of it cannot be trusted.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Human-facing numbers come from a dedicated sequence, never count+1 (ARCH-02 §1).
-- The application calls nextval() inside the same transaction that inserts the row:
--
--   Order.number   = 'MK-'  || to_char(now(),'YYYY') || '-' || lpad(nextval('seq_order_number')::text, 6, '0')
--   Invoice.number = 'INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('seq_invoice_number')::text, 6, '0')
--
-- Uniqueness is enforced by the UNIQUE constraints already present on both columns.
CREATE SEQUENCE seq_order_number   START 1;
CREATE SEQUENCE seq_invoice_number START 1;
