-- =============================================================================
-- 12_roles_and_grants.sql
-- Database privileges.
--   assurance_app        owns the schema (created in 01) and every object in
--                        it, so it can read and write all tables.
--   assurance_reporting  read-only, and only through the reporting views
--                        (11_reporting_views.sql). It cannot read tables
--                        directly, so it never sees evidence detail or case
--                        results (framework sections 7.6 and 11).
--
-- Run as assurance_app (the schema owner).
-- =============================================================================
SET search_path = assurance;

GRANT USAGE ON SCHEMA assurance TO assurance_reporting;

GRANT SELECT ON
  v_open_findings,
  v_release_scan_asr,
  v_application_assurance,
  v_ec_member_summary,
  v_program_measures,
  v_mean_time_to_fix,
  v_judge_usage
TO assurance_reporting;

-- Nothing else for the reporting role, now or for tables created later.
REVOKE ALL ON ALL TABLES IN SCHEMA assurance FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA assurance FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA assurance FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA assurance REVOKE ALL ON TABLES FROM PUBLIC;
