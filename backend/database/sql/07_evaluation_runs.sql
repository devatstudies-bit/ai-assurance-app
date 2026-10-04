-- =============================================================================
-- 07_evaluation_runs.sql
-- Evaluation runs (framework section 6): a release's golden dataset scored by
-- a selected judge model. A completed Pre-release run becomes the release's
-- evaluation of record, which the gate reads.
-- =============================================================================
SET search_path = assurance;

CREATE TABLE evaluation_runs (
  id                         text          PRIMARY KEY CHECK (id ~ '^EV-[0-9]{4,}$'),
  app_id                     text          NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  version                    text          NOT NULL,
  mode                       text          NOT NULL CHECK (mode IN ('Pre-release', 'Online')),
  status                     text          NOT NULL DEFAULT 'Running'
                             CHECK (status IN ('Running', 'Completed', 'Failed')),
  progress                   smallint      NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  started_at                 timestamptz   NOT NULL DEFAULT now(),
  finished_at                timestamptz,

  -- Judge provenance: the model, plus a snapshot of its configuration at run
  -- time so later edits to the model do not change the evidence.
  judge_model_id             text          NOT NULL REFERENCES model_deployments (id) ON DELETE RESTRICT,
  judge                      jsonb         NOT NULL CHECK (jsonb_typeof(judge) = 'object' AND judge ? 'name'),

  dataset_id                 text          REFERENCES library_items (id) ON DELETE RESTRICT,
  dataset                    text          NOT NULL,          -- dataset path at run time
  profile                    text          NOT NULL,
  cases                      integer       NOT NULL DEFAULT 0 CHECK (cases >= 0),

  -- [{"name","key","kind":"judge|deterministic","value","limit","op",">=|<=","format":"score|ratio|pct"}]
  metrics                    jsonb         NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(metrics) = 'array'),
  content_safety_defect_pct  numeric(5,2)  CHECK (content_safety_defect_pct BETWEEN 0 AND 100),
  pass_k                     numeric(5,2)  CHECK (pass_k BETWEEN 0 AND 100),
  -- Up to 100 cases: [{"id","query","response","scores":{"<rubric>":{"value","pass","reason"}}}]
  case_results               jsonb         NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(case_results) = 'array'),
  judge_calls                integer       NOT NULL DEFAULT 0 CHECK (judge_calls >= 0),
  error                      text,

  CONSTRAINT finished_after_start CHECK (finished_at IS NULL OR finished_at >= started_at),
  CONSTRAINT done_has_finish_time CHECK (status = 'Running' OR finished_at IS NOT NULL),
  CONSTRAINT failed_has_error     CHECK (status <> 'Failed' OR error IS NOT NULL)
);

CREATE INDEX evaluation_runs_app_started_idx ON evaluation_runs (app_id, started_at DESC);
CREATE INDEX evaluation_runs_judge_idx       ON evaluation_runs (judge_model_id);
CREATE INDEX evaluation_runs_running_idx     ON evaluation_runs (status) WHERE status = 'Running';

COMMENT ON TABLE  evaluation_runs IS 'Evaluation runs scored by a selected judge model (framework section 6).';
COMMENT ON COLUMN evaluation_runs.mode         IS 'Pre-release runs become the release''s evaluation of record; Online runs are monitoring only.';
COMMENT ON COLUMN evaluation_runs.judge        IS 'Snapshot of the judge configuration used, for provenance.';
COMMENT ON COLUMN evaluation_runs.metrics      IS 'Profile metrics with value, limit and whether the judge or code produced them.';
COMMENT ON COLUMN evaluation_runs.case_results IS 'Per-case judge verdicts with reasons (first 100 cases).';
