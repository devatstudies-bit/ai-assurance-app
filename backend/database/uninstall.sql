-- =============================================================================
-- uninstall.sql
-- DESTRUCTIVE. Removes the whole AI Assurance schema and every record in it:
-- findings, runs, evaluations, sign-offs and all other evidence.
--
-- Intended for development and test databases only. Take a backup first
-- anywhere the data matters:
--   pg_dump -h <host> -U assurance_app -d assurance -n assurance -Fc -f assurance_backup.dump
--
--   psql -h <host> -U assurance_app -d assurance -v confirm=yes -f backend/database/uninstall.sql
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?confirm}
\else
  \echo 'Refusing to run: pass -v confirm=yes to drop the assurance schema.'
  \quit
\endif

DROP SCHEMA IF EXISTS assurance CASCADE;
\echo 'Schema assurance dropped.'
