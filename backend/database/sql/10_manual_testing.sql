-- =============================================================================
-- 10_manual_testing.sql
-- Manual expert exercises (framework sections 7.5 and 7.6):
--   authorizations    written authorization naming application, environment,
--                     period and testers; no red teaming without one
--   manual_sessions   time-boxed exercises under an authorization
--   manual_attempts   every attempt testers log (summary only; transcripts go
--                     to restricted storage)
-- =============================================================================
SET search_path = assurance;

-- ---------------------------------------------------------------------------
-- authorizations
-- ---------------------------------------------------------------------------
CREATE TABLE authorizations (
  id           text         PRIMARY KEY CHECK (id ~ '^AUTH-[0-9]{3,}$'),
  app_id       text         NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  -- Section 7.6: sandbox or staging only, never production
  environment  text         NOT NULL CHECK (environment IN ('Sandbox', 'Staging')),
  valid_from   timestamptz  NOT NULL,
  valid_to     timestamptz  NOT NULL,
  testers      text[]       NOT NULL CHECK (cardinality(testers) > 0),
  approved_by  text         NOT NULL,

  CONSTRAINT valid_period CHECK (valid_to > valid_from),
  -- Lets manual_sessions reference (id, app_id) so a session cannot use another app's authorization
  CONSTRAINT authorizations_id_app_key UNIQUE (id, app_id)
);

CREATE INDEX authorizations_app_idx ON authorizations (app_id, valid_to DESC);

COMMENT ON TABLE  authorizations IS 'Written authorizations for red teaming (section 7.6).';
COMMENT ON COLUMN authorizations.valid_from IS 'Start of the authorized testing window (the API exposes it as "from").';
COMMENT ON COLUMN authorizations.valid_to   IS 'End of the window; sessions cannot start after it.';

-- ---------------------------------------------------------------------------
-- manual_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE manual_sessions (
  id                text         PRIMARY KEY CHECK (id ~ '^EX-[0-9]{3,}$'),
  app_id            text         NOT NULL,
  authorization_id  text         NOT NULL,
  title             text         NOT NULL,
  status            text         NOT NULL DEFAULT 'Planned'
                    CHECK (status IN ('Planned', 'Active', 'Completed')),
  starts_at         timestamptz  NOT NULL,
  ends_at           timestamptz  NOT NULL,
  testers           text[]       NOT NULL CHECK (cardinality(testers) > 0),
  objectives        text[]       NOT NULL CHECK (cardinality(objectives) > 0),
  -- Harm categories testers opted out of (section 7.6 "Harmful content")
  opt_outs          text[]       NOT NULL DEFAULT '{}',

  -- The authorization must be for the same application
  CONSTRAINT manual_sessions_authorization_fk
    FOREIGN KEY (authorization_id, app_id) REFERENCES authorizations (id, app_id) ON DELETE RESTRICT,
  CONSTRAINT manual_sessions_app_fk
    FOREIGN KEY (app_id) REFERENCES applications (id) ON DELETE RESTRICT,
  CONSTRAINT session_window CHECK (ends_at >= starts_at)
);

CREATE INDEX manual_sessions_app_idx ON manual_sessions (app_id, starts_at DESC);

COMMENT ON TABLE manual_sessions IS 'Manual expert exercises (section 7.5) under a written authorization.';

-- ---------------------------------------------------------------------------
-- manual_attempts: append-only log of every attempt
-- ---------------------------------------------------------------------------
CREATE TABLE manual_attempts (
  session_id  text         NOT NULL REFERENCES manual_sessions (id) ON DELETE RESTRICT,
  attempt_id  text         NOT NULL CHECK (attempt_id ~ '^A-[0-9]+$'),
  at          timestamptz  NOT NULL DEFAULT now(),
  tester      text         NOT NULL,
  category    text         NOT NULL,
  technique   text         NOT NULL CHECK (length(technique) > 0),
  entry_point text         NOT NULL
              CHECK (entry_point IN ('User', 'Document', 'Tool output', 'MCP response', 'Peer agent', 'Upload')),
  outcome     text         NOT NULL CHECK (outcome IN ('Defended', 'Partial', 'Succeeded')),
  note        text         NOT NULL DEFAULT '',           -- summary only, never the raw transcript
  finding_id  text         REFERENCES findings (id) ON DELETE RESTRICT,

  PRIMARY KEY (session_id, attempt_id)
);

-- Attempts may be linked to a finding later; nothing else may change.
CREATE OR REPLACE FUNCTION manual_attempts_link_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'manual_attempts is append-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.finding_id IS NOT NULL
     OR (NEW.session_id, NEW.attempt_id, NEW.at, NEW.tester, NEW.category, NEW.technique,
         NEW.entry_point, NEW.outcome, NEW.note)
        IS DISTINCT FROM
        (OLD.session_id, OLD.attempt_id, OLD.at, OLD.tester, OLD.category, OLD.technique,
         OLD.entry_point, OLD.outcome, OLD.note) THEN
    RAISE EXCEPTION 'Only an unlinked attempt''s finding_id may be set' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER manual_attempts_append_only
  BEFORE UPDATE OR DELETE ON manual_attempts
  FOR EACH ROW EXECUTE FUNCTION manual_attempts_link_only();

COMMENT ON TABLE  manual_attempts IS 'Attempts logged during manual exercises. Append-only except linking a finding once.';
COMMENT ON COLUMN manual_attempts.note IS 'Observation summary. Raw prompts and responses go to restricted storage (section 7.6).';
