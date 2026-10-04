-- =============================================================================
-- 01_schema_and_functions.sql
-- The "assurance" schema, the shared record-ID sequence, and helper functions
-- used by triggers in later scripts.
--
-- Run as assurance_app, connected to the "assurance" database.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS assurance AUTHORIZATION assurance_app;
SET search_path = assurance;

COMMENT ON SCHEMA assurance IS
  'AI Assurance application: registry, evaluations, red teaming, findings, release gate and evidence '
  '(AI Evaluation and Red Teaming Framework v1.0).';

-- ---------------------------------------------------------------------------
-- Shared record ID sequence
--   Findings (FND-), scans (RT-), regression tests (REG-), run records (RUN-)
--   and evaluation runs (EV-) draw from ONE sequence so IDs are unique and
--   ordered across types, e.g. FND-0231, RT-0245, EV-0247.
--   The API formats: prefix || '-' || lpad(nextval::text, 4, '0').
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS record_id_seq AS bigint START WITH 1 INCREMENT BY 1;
COMMENT ON SEQUENCE record_id_seq IS
  'Shared numeric part of FND-, RT-, REG-, RUN- and EV- identifiers.';

CREATE OR REPLACE FUNCTION next_record_id(prefix text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT prefix || '-' || lpad(nextval('assurance.record_id_seq')::text, 4, '0');
$$;
COMMENT ON FUNCTION next_record_id(text) IS
  'Returns the next record ID for a prefix, e.g. next_record_id(''FND'') -> ''FND-0242''.';

-- ---------------------------------------------------------------------------
-- set_updated_at(): keeps an updated_at column current on every UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- forbid_change(): makes a table append-only. Rows can be inserted, never
-- updated or deleted. Used for audit trails (finding events, gate decisions).
-- TRUNCATE (used by a full data reset) is a separate privilege and is not
-- affected by row triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forbid_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
