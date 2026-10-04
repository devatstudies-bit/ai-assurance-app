-- =============================================================================
-- 08_findings.sql
-- Findings management (framework section 8 and 10.3 "Finding"):
--   findings           one row per confirmed or suspected weakness
--   finding_events     append-only history of every change (audit trail)
--   regression_tests   the test added when a finding closes
--
-- The rule that connects everything (section 8.2) is enforced here as well as
-- in the API: a finding cannot be Closed without a regression test.
-- =============================================================================
SET search_path = assurance;

-- ---------------------------------------------------------------------------
-- findings
-- ---------------------------------------------------------------------------
CREATE TABLE findings (
  id                       text          PRIMARY KEY CHECK (id ~ '^FND-[0-9]{4,}$'),
  app_id                   text          NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  title                    text          NOT NULL CHECK (length(title) >= 3),
  severity                 text          NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
  status                   text          NOT NULL DEFAULT 'New'
                           CHECK (status IN ('New', 'Triaged', 'In fix', 'Retest pending', 'Closed', 'Accepted risk')),
  source                   text          NOT NULL
                           CHECK (source IN ('Automated scan', 'Scenario', 'Manual exercise', 'Production monitoring')),
  source_ref               text          NOT NULL,        -- e.g. 'SC-07 · RT-1001', 'EX-015 · A-3'
  category                 text          NOT NULL,        -- risk category or 'Hardening'
  owasp                    text[]        NOT NULL DEFAULT '{}'
                           CHECK (owasp <@ ARRAY['LLM01', 'LLM02', 'LLM03', 'LLM04', 'LLM05',
                                                 'LLM06', 'LLM07', 'LLM08', 'LLM09', 'LLM10']),
  owner                    text          NOT NULL DEFAULT 'Unassigned',
  opened_at                timestamptz   NOT NULL DEFAULT now(),
  due_at                   timestamptz,                    -- from severity; NULL for Low (backlog)
  closed_at                timestamptz,
  regression_test_id       text,                           -- FK added below (circular with regression_tests)
  work_item                text,                           -- Azure DevOps or Jira item
  found_in                 text          NOT NULL CHECK (found_in IN ('Pre-release', 'Production')),
  evidence                 text          NOT NULL,         -- summary; full evidence in restricted storage

  -- Risk acceptance (governance only, section 8.2 step 6)
  acceptance_approved_by   text,
  acceptance_expires       timestamptz,
  acceptance_controls      text,

  -- Section 8.2: closing requires a regression test and a closing time
  CONSTRAINT closed_requires_regression_test CHECK (
    status <> 'Closed' OR (regression_test_id IS NOT NULL AND closed_at IS NOT NULL)
  ),
  -- Section 8.2: accepted risk requires approval, an expiry date and compensating controls
  CONSTRAINT accepted_risk_is_complete CHECK (
    status <> 'Accepted risk'
    OR (acceptance_approved_by IS NOT NULL AND acceptance_expires IS NOT NULL
        AND acceptance_controls IS NOT NULL AND length(acceptance_controls) > 0)
  ),
  -- Section 8.1: only Low findings go to the backlog without a deadline.
  -- Accepted risk replaces the fix deadline with acceptance_expires.
  CONSTRAINT deadline_unless_low CHECK (severity = 'Low' OR due_at IS NOT NULL OR status = 'Accepted risk'),
  CONSTRAINT due_after_open      CHECK (due_at IS NULL OR due_at >= opened_at),
  CONSTRAINT closed_after_open   CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

CREATE INDEX findings_app_status_idx ON findings (app_id, status);
CREATE INDEX findings_open_due_idx   ON findings (due_at)
  WHERE status IN ('New', 'Triaged', 'In fix', 'Retest pending');
CREATE INDEX findings_severity_idx   ON findings (severity)
  WHERE status IN ('New', 'Triaged', 'In fix', 'Retest pending');

COMMENT ON TABLE  findings IS 'Findings (framework section 8). Open = New, Triaged, In fix or Retest pending.';
COMMENT ON COLUMN findings.due_at   IS 'Fix deadline from severity: Critical 1 day, High 7 days, Medium 30 days, Low none.';
COMMENT ON COLUMN findings.evidence IS 'Evidence summary. Shown in full to Security and the AI platform; product teams see the first clause.';
COMMENT ON COLUMN findings.regression_test_id IS 'Required when Closed: the regression test that now runs on every release.';

-- ---------------------------------------------------------------------------
-- finding_events: append-only audit trail of every finding change
-- ---------------------------------------------------------------------------
CREATE TABLE finding_events (
  id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finding_id  text         NOT NULL REFERENCES findings (id) ON DELETE RESTRICT,
  at          timestamptz  NOT NULL DEFAULT now(),
  actor       text         NOT NULL,          -- person, or 'Scan engine'
  text        text         NOT NULL           -- e.g. 'Moved to In fix; linked ADO-58225'
);

CREATE INDEX finding_events_finding_idx ON finding_events (finding_id, at);

CREATE TRIGGER finding_events_append_only
  BEFORE UPDATE OR DELETE ON finding_events
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

COMMENT ON TABLE finding_events IS 'Append-only history of every finding change. Updates and deletes are rejected.';

-- ---------------------------------------------------------------------------
-- regression_tests: created when a finding closes (section 8.2 step 5)
-- ---------------------------------------------------------------------------
CREATE TABLE regression_tests (
  id          text         PRIMARY KEY CHECK (id ~ '^REG-[0-9]{3,}$'),
  app_id      text         NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  finding_id  text         NOT NULL UNIQUE REFERENCES findings (id) ON DELETE RESTRICT,
  title       text         NOT NULL,
  added_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX regression_tests_app_idx ON regression_tests (app_id);

COMMENT ON TABLE regression_tests IS 'Regression tests added when findings close; they run on every future release.';

-- findings.regression_test_id -> regression_tests.id. Deferred because the
-- test and the closing update are written in the same transaction.
ALTER TABLE findings
  ADD CONSTRAINT findings_regression_test_fk
  FOREIGN KEY (regression_test_id) REFERENCES regression_tests (id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- A finding's regression test must belong to the same finding.
CREATE OR REPLACE FUNCTION check_regression_test_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.regression_test_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM assurance.regression_tests r
       WHERE r.id = NEW.regression_test_id AND r.finding_id = NEW.id) THEN
    RAISE EXCEPTION 'Regression test % does not belong to finding %', NEW.regression_test_id, NEW.id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER findings_regression_test_owner
  AFTER INSERT OR UPDATE OF regression_test_id ON findings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_regression_test_owner();
