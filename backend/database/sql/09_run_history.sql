-- =============================================================================
-- 09_run_history.sql
-- Run history (framework section 10.4 "Run history"): every gate decision,
-- evaluation, scan and manual exercise, with version, result and a reference
-- to its evidence. Append-only: a run record is evidence and never changes.
-- =============================================================================
SET search_path = assurance;

CREATE TABLE runs (
  id        text         PRIMARY KEY CHECK (id ~ '^RUN-[0-9]{4,}$'),
  app_id    text         NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  at        timestamptz  NOT NULL DEFAULT now(),
  kind      text         NOT NULL
            CHECK (kind IN ('Release gate', 'Evaluation', 'Online evaluation', 'Release scan',
                            'Developer scan', 'Scheduled scan', 'Manual exercise')),
  version   text         NOT NULL,
  detail    text         NOT NULL,
  result    text         NOT NULL
            CHECK (result IN ('Passed', 'Blocked', 'Completed', 'Within limits', 'Alert', 'Running')),
  -- The record this run refers to: RT-…, EV-… or EX-… (polymorphic, so no FK)
  ref       text         CHECK (ref IS NULL OR ref ~ '^(RT|EV|EX)-[0-9]+$'),

  -- A gate run either passes or blocks, and only gate runs can block
  CONSTRAINT gate_run_passes_or_blocks CHECK (kind <> 'Release gate' OR result IN ('Passed', 'Blocked')),
  CONSTRAINT only_gate_runs_block      CHECK (result <> 'Blocked' OR kind = 'Release gate')
);

CREATE INDEX runs_app_at_idx  ON runs (app_id, at DESC);
CREATE INDEX runs_kind_at_idx ON runs (kind, at DESC);

CREATE TRIGGER runs_append_only
  BEFORE UPDATE OR DELETE ON runs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

COMMENT ON TABLE  runs IS 'Run history: gate decisions, evaluations, scans and manual exercises. Append-only evidence.';
COMMENT ON COLUMN runs.result IS 'Passed/Blocked for gate runs; Completed, Within limits or Alert for the others.';
COMMENT ON COLUMN runs.ref    IS 'Scan (RT-), evaluation (EV-) or manual session (EX-) this run refers to.';
