-- =============================================================================
-- 06_red_team_scans.sql
-- Automated red team scans (framework sections 7.2 and 10.3 "RedTeamScan").
-- One row per scan. Attack prompts and responses are NOT stored here; they
-- belong in restricted storage with access logging (section 7.6).
-- =============================================================================
SET search_path = assurance;

CREATE TABLE red_team_scans (
  id                 text          PRIMARY KEY CHECK (id ~ '^RT-[0-9]{4,}$'),
  app_id             text          NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  version            text          NOT NULL,
  mode               text          NOT NULL CHECK (mode IN ('Release', 'Developer', 'Scheduled')),
  status             text          NOT NULL DEFAULT 'Running'
                     CHECK (status IN ('Running', 'Completed', 'Failed')),
  progress           smallint      NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  started_at         timestamptz   NOT NULL DEFAULT now(),
  duration_min       integer       NOT NULL DEFAULT 0 CHECK (duration_min >= 0),

  -- What was requested
  complexities       text[]        NOT NULL
                     CHECK (cardinality(complexities) > 0
                            AND complexities <@ ARRAY['Easy', 'Moderate', 'Difficult']),
  strategies         text[]        NOT NULL
                     CHECK (cardinality(strategies) > 0
                            AND strategies <@ ARRAY['Baseline', 'Encoding', 'Jailbreak', 'Indirect', 'Multi-turn']),
  categories         text[]        NOT NULL DEFAULT '{}'
                     CHECK (categories <@ ARRAY['Hate and unfairness', 'Violence', 'Sexual', 'Self-harm',
                                                'Protected material', 'Code vulnerability', 'Ungrounded attributes',
                                                'Sensitive data leakage', 'Task adherence', 'Prohibited actions']),

  -- Engine that ran the scan (provenance)
  attack_model_id    text          REFERENCES model_deployments (id) ON DELETE RESTRICT,
  attack_model       text          NOT NULL,   -- display label captured at run time

  -- Results
  attempts           integer       NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  successes          integer       NOT NULL DEFAULT 0 CHECK (successes >= 0),
  -- [{"category": "Violence", "cells": {"Baseline": 0, "Encoding": 2.5, ...}, "overall": 0.5}]  (percent)
  heat               jsonb         NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(heat) = 'array'),
  -- {"Easy": 0.2, "Moderate": 1.4, "Difficult": 3.9}  (percent)
  by_complexity      jsonb         NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(by_complexity) = 'object'),
  -- [{"id","name","entry","critical","defended","detection","reproduced","findingId"}]
  scenarios          jsonb         NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scenarios) = 'array'),
  canary_leaks       integer       NOT NULL DEFAULT 0 CHECK (canary_leaks >= 0),
  summary            text,
  error              text,

  CONSTRAINT successes_within_attempts CHECK (successes <= attempts),
  CONSTRAINT completed_is_full CHECK (status <> 'Completed' OR progress = 100),
  CONSTRAINT failed_has_error  CHECK (status <> 'Failed' OR error IS NOT NULL)
);

CREATE INDEX red_team_scans_app_started_idx ON red_team_scans (app_id, started_at DESC);
CREATE INDEX red_team_scans_running_idx     ON red_team_scans (status) WHERE status = 'Running';

COMMENT ON TABLE  red_team_scans IS 'Automated red team scans (framework 7.2, data model 10.3 RedTeamScan). No attack content.';
COMMENT ON COLUMN red_team_scans.mode          IS 'Release scans become the release''s scan of record for the gate.';
COMMENT ON COLUMN red_team_scans.attack_model  IS 'Engine label captured when the scan ran, kept even if the model is edited later.';
COMMENT ON COLUMN red_team_scans.heat          IS 'Attack success rate per risk category and strategy group, percent.';
COMMENT ON COLUMN red_team_scans.scenarios     IS 'Scenario attack results (section 7.3) carried with the scan.';
COMMENT ON COLUMN red_team_scans.canary_leaks  IS 'Canary values that appeared where they must not; the gate requires 0.';
