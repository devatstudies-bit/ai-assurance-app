-- =============================================================================
-- 03_applications.sql
-- Application registry (framework section 10.1): every AI application is
-- registered once with its type, risk tier, owner, threat model and current
-- release candidate.
-- =============================================================================
SET search_path = assurance;

CREATE TABLE applications (
  id                   text         PRIMARY KEY
                       CHECK (id ~ '^uc-[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 text         NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  type                 text         NOT NULL
                       CHECK (type IN ('RAG assistant', 'Chat tool', 'Agent', 'Multi-agent', 'MCP server')),
  tier                 text         NOT NULL REFERENCES gate_thresholds (tier),
  stage                text         NOT NULL DEFAULT 'Design'
                       CHECK (stage IN ('Design', 'Build', 'Pre-release', 'Launch', 'Production')),
  owner                text         NOT NULL,
  ec_member            text         NOT NULL DEFAULT '[EC member]',
  description          text         NOT NULL DEFAULT '',
  profile              text         NOT NULL
                       CHECK (profile IN ('rag-standard@v1', 'chat-basic@v1', 'agent-standard@v1',
                                          'multi-agent@v1', 'mcp-tools@v1')),
  sandbox              text         NOT NULL,
  quality_index        smallint     NOT NULL DEFAULT 0 CHECK (quality_index BETWEEN 0 AND 100),

  -- Threat model (section 5). Always read and written whole.
  -- {"dataAccess": [...], "actions": [...], "entryPoints": [...],
  --  "threats": ["LLM01", ...], "approvedBy": "...", "version": 3}
  threat_model         jsonb        NOT NULL
                       CHECK (jsonb_typeof(threat_model) = 'object'
                              AND threat_model ? 'entryPoints' AND threat_model ? 'threats'),

  -- Current release candidate. Always read and written whole.
  -- {"version": "v7", "date": "...", "pipeline": "#4812", "model": "...", "prompt": "v7",
  --  "goldenSet": "...", "metrics": [{"name","value","limit","op","format"}],
  --  "contentSafetyDefectPct": 0, "passK": 84,
  --  "scanId": "RT-1001", "evaluationRunId": "EV-0205", "judgeModelId": "judge-gpt-41",
  --  "signOffs": [{"role","by","at"}]}
  release              jsonb        NOT NULL
                       CHECK (jsonb_typeof(release) = 'object' AND release ? 'version'),

  last_manual_test     timestamptz,
  next_manual_test     timestamptz,
  next_scheduled_scan  timestamptz  NOT NULL,

  -- One point per release scan: [{"version": "v6", "asr": 1.9}, ...]
  asr_history          jsonb        NOT NULL DEFAULT '[]'::jsonb
                       CHECK (jsonb_typeof(asr_history) = 'array'),

  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),

  -- The evaluation profile follows from the application type.
  CONSTRAINT profile_matches_type CHECK (
       (type = 'RAG assistant' AND profile = 'rag-standard@v1')
    OR (type = 'Chat tool'     AND profile = 'chat-basic@v1')
    OR (type = 'Agent'         AND profile = 'agent-standard@v1')
    OR (type = 'Multi-agent'   AND profile = 'multi-agent@v1')
    OR (type = 'MCP server'    AND profile = 'mcp-tools@v1')
  )
);

CREATE UNIQUE INDEX applications_name_key ON applications (lower(name));
CREATE INDEX applications_tier_idx ON applications (tier);

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  applications IS 'Application registry (framework 10.1). One row per AI application.';
COMMENT ON COLUMN applications.id            IS 'Registry ID, uc-<slug>, derived from the name at registration.';
COMMENT ON COLUMN applications.tier          IS 'Risk tier (section 4.1); decides gate thresholds, scan cadence and sign-off.';
COMMENT ON COLUMN applications.profile       IS 'Evaluation profile: which metrics the application is scored on.';
COMMENT ON COLUMN applications.sandbox       IS 'Sandbox endpoint resolved by scans and live evaluations; never typed by hand at run time (section 14).';
COMMENT ON COLUMN applications.quality_index IS 'Quality index 0-100 from online evaluation.';
COMMENT ON COLUMN applications.threat_model  IS 'Threat model JSON (section 5): data access, actions, entry points, OWASP threats, approval.';
COMMENT ON COLUMN applications.release       IS 'Current release candidate JSON, including its evaluation and scan of record and sign-offs.';
COMMENT ON COLUMN applications.asr_history   IS 'Attack success rate per release scan, for the trend chart.';
