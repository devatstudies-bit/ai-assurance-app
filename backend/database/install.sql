-- =============================================================================
-- install.sql
-- Creates the complete AI Assurance schema in one transaction: if any step
-- fails, nothing is created.
--
-- Prerequisite: 00_create_database.sql has created the database and roles.
--
--   psql -h <host> -U assurance_app -d assurance -f backend/database/install.sql
--
-- Then point the API at it:
--   ASSURANCE_DATABASE_URL=postgresql+psycopg://assurance_app:<password>@<host>:5432/assurance
-- =============================================================================

\set ON_ERROR_STOP on
\echo 'Installing the AI Assurance schema...'

BEGIN;

\ir sql/01_schema_and_functions.sql
\ir sql/02_gate_thresholds.sql
\ir sql/03_applications.sql
\ir sql/04_model_deployments.sql
\ir sql/05_library_items.sql
\ir sql/06_red_team_scans.sql
\ir sql/07_evaluation_runs.sql
\ir sql/08_findings.sql
\ir sql/09_run_history.sql
\ir sql/10_manual_testing.sql
\ir sql/11_reporting_views.sql
\ir sql/12_roles_and_grants.sql

-- Record what was installed
CREATE TABLE IF NOT EXISTS assurance.schema_version (
  version      text         PRIMARY KEY,
  installed_at timestamptz  NOT NULL DEFAULT now(),
  description  text         NOT NULL
);
INSERT INTO assurance.schema_version (version, description)
VALUES ('1.0.0', 'Initial schema: registry, models, library, scans, evaluations, findings, runs, manual testing, reporting views')
ON CONFLICT (version) DO NOTHING;

COMMIT;

\echo 'Done. Tables:'
\dt assurance.*
