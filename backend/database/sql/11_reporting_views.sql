-- =============================================================================
-- 11_reporting_views.sql
-- Read-only views for the AI Metrics Dashboard (framework section 11) and for
-- auditors. Section 11: "Raw attack prompts and responses are never shown on
-- the dashboard; it displays categories, rates and finding summaries only."
-- These views therefore never expose finding evidence, scan scenarios'
-- detection details or evaluation case results.
-- =============================================================================
SET search_path = assurance;

-- ---------------------------------------------------------------------------
-- v_open_findings: open findings with deadline status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_open_findings AS
SELECT
  f.id,
  f.app_id,
  a.name                                              AS app_name,
  a.tier,
  a.ec_member,
  f.title,
  f.severity,
  f.status,
  f.owner,
  f.source,
  f.category,
  f.owasp,
  f.found_in,
  f.opened_at,
  f.due_at,
  (f.due_at IS NOT NULL AND f.due_at < now())         AS overdue,
  CASE WHEN f.due_at < now()
       THEN floor(extract(epoch FROM now() - f.due_at) / 86400)::int
  END                                                 AS days_overdue,
  f.work_item
FROM findings f
JOIN applications a ON a.id = f.app_id
WHERE f.status IN ('New', 'Triaged', 'In fix', 'Retest pending');

COMMENT ON VIEW v_open_findings IS 'Open findings with deadline status. No evidence detail.';

-- ---------------------------------------------------------------------------
-- v_release_scan_asr: attack success rate per completed release scan
-- (section 11 "trend by release")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_release_scan_asr AS
SELECT
  s.app_id,
  s.version,
  s.id                                                AS scan_id,
  s.started_at,
  s.attempts,
  s.successes,
  round(100.0 * s.successes / NULLIF(s.attempts, 0), 2) AS asr_pct,
  s.canary_leaks,
  s.attack_model                                      AS attack_engine
FROM red_team_scans s
WHERE s.mode = 'Release' AND s.status = 'Completed';

COMMENT ON VIEW v_release_scan_asr IS 'Attack success rate of each completed release scan.';

-- ---------------------------------------------------------------------------
-- v_application_assurance: one row per application combining quality,
-- security and the latest gate decision (section 11 "Evaluation Overview")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_application_assurance AS
SELECT
  a.id,
  a.name,
  a.type,
  a.tier,
  a.stage,
  a.owner,
  a.ec_member,
  a.quality_index,
  a.release ->> 'version'                             AS release_version,
  a.release ->> 'scanId'                              AS release_scan_id,
  round(100.0 * s.successes / NULLIF(s.attempts, 0), 2) AS release_asr_pct,
  a.release ->> 'evaluationRunId'                     AS release_evaluation_id,
  a.release ->> 'judgeModelId'                        AS release_judge_model_id,
  COALESCE(f.open_critical, 0)                        AS open_critical,
  COALESCE(f.open_high, 0)                            AS open_high,
  COALESCE(f.open_total, 0)                           AS open_total,
  COALESCE(f.overdue, 0)                              AS overdue,
  g.result                                            AS last_gate_result,
  g.at                                                AS last_gate_at,
  a.last_manual_test,
  a.next_scheduled_scan
FROM applications a
LEFT JOIN red_team_scans s ON s.id = a.release ->> 'scanId'
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE severity = 'Critical')                 AS open_critical,
         count(*) FILTER (WHERE severity = 'High')                     AS open_high,
         count(*)                                                      AS open_total,
         count(*) FILTER (WHERE due_at < now())                        AS overdue
  FROM findings
  WHERE app_id = a.id AND status IN ('New', 'Triaged', 'In fix', 'Retest pending')
) f ON true
LEFT JOIN LATERAL (
  SELECT r.result, r.at
  FROM runs r
  WHERE r.app_id = a.id AND r.kind = 'Release gate'
  ORDER BY r.at DESC
  LIMIT 1
) g ON true;

COMMENT ON VIEW v_application_assurance IS
  'Assurance status per application: quality index, release attack success rate, open findings, last gate decision.';

-- ---------------------------------------------------------------------------
-- v_ec_member_summary: applications, open findings and overdue fixes rolled
-- up per executive committee member (section 11 "EC Member View")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ec_member_summary AS
SELECT
  ec_member,
  count(*)                       AS applications,
  sum(open_critical)             AS open_critical,
  sum(open_high)                 AS open_high,
  sum(open_total)                AS open_findings,
  sum(overdue)                   AS overdue_fixes,
  count(*) FILTER (WHERE last_gate_result = 'Blocked') AS releases_blocked
FROM v_application_assurance
GROUP BY ec_member;

COMMENT ON VIEW v_ec_member_summary IS 'Applications, open findings and overdue fixes per EC member.';

-- ---------------------------------------------------------------------------
-- v_program_measures: the section 12.3 program measures for the whole portfolio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_program_measures AS
SELECT
  (SELECT count(*) FROM applications)                                          AS applications_registered,
  (SELECT count(*) FROM applications WHERE release ? 'scanId')                 AS applications_assessed,
  (SELECT round(100.0 * count(*) FILTER (WHERE result = 'Passed') / NULLIF(count(*), 0), 1)
     FROM runs WHERE kind = 'Release gate')                                    AS gate_pass_rate_pct,
  (SELECT count(*) FROM v_open_findings)                                       AS open_findings,
  (SELECT count(*) FROM v_open_findings WHERE overdue)                          AS overdue_fixes,
  (SELECT round(avg(extract(epoch FROM closed_at - opened_at) / 86400)::numeric, 1)
     FROM findings WHERE status = 'Closed')                                    AS mean_days_to_fix,
  (SELECT round(100.0 * count(*) FILTER (WHERE regression_test_id IS NOT NULL) / NULLIF(count(*), 0), 1)
     FROM findings WHERE status = 'Closed')                                    AS closed_with_regression_pct,
  (SELECT count(*) FROM findings WHERE found_in = 'Production')                AS findings_found_in_production,
  (SELECT count(*) FROM findings WHERE found_in = 'Pre-release')               AS findings_found_pre_release;

COMMENT ON VIEW v_program_measures IS 'Program measures from framework section 12.3, for the whole portfolio.';

-- ---------------------------------------------------------------------------
-- v_mean_time_to_fix: mean days from opening to closing, by severity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_mean_time_to_fix AS
SELECT
  severity,
  count(*)                                                                AS closed_findings,
  round(avg(extract(epoch FROM closed_at - opened_at) / 86400)::numeric, 1) AS mean_days_to_fix
FROM findings
WHERE status = 'Closed'
GROUP BY severity;

COMMENT ON VIEW v_mean_time_to_fix IS 'Mean time to fix by severity (section 12.3).';

-- ---------------------------------------------------------------------------
-- v_judge_usage: which judge scored which releases, with calibration status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_judge_usage AS
SELECT
  m.id                     AS judge_model_id,
  m.name,
  m.provider,
  m.deployment,
  m.model_version,
  m.calibration_agreement,
  m.calibrated_at,
  (m.provider <> 'simulated'
   AND (m.calibration_agreement IS NULL OR m.calibration_agreement < 0.8
        OR m.calibrated_at < now() - interval '92 days'))         AS needs_calibration,
  count(e.id)              AS evaluation_runs,
  max(e.started_at)        AS last_used_at
FROM model_deployments m
LEFT JOIN evaluation_runs e ON e.judge_model_id = m.id
WHERE m.purpose = 'judge'
GROUP BY m.id;

COMMENT ON VIEW v_judge_usage IS 'Judge models, how often they scored runs, and whether calibration is due (section 12.2).';
