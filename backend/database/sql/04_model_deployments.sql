-- =============================================================================
-- 04_model_deployments.sql
-- Model registry: judge models (score evaluations) and attack engines (run red
-- team scans). Framework section 10.2: dedicated, version-pinned deployments
-- that never serve production traffic. Section 12.2: judges are calibrated
-- against human labels quarterly.
--
-- SECRETS ARE NEVER STORED. api_key_env holds the NAME of the environment
-- variable (on the API server) that contains the key, or auth = 'entra'.
-- =============================================================================
SET search_path = assurance;

CREATE TABLE model_deployments (
  id                        text          PRIMARY KEY
                            CHECK (id ~ '^(judge|attack)-[a-z0-9]+(-[a-z0-9]+)*$'),
  name                      text          NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  purpose                   text          NOT NULL CHECK (purpose IN ('judge', 'attack')),
  provider                  text          NOT NULL
                            CHECK (provider IN ('simulated', 'azure-openai', 'openai-compatible',
                                                'anthropic', 'azure-redteam-service')),
  endpoint                  text,          -- for azure-redteam-service: the Foundry project endpoint
  deployment                text,          -- deployment name or model ID
  model_version             text,          -- pinned version, recorded with every run
  api_version               text,          -- Azure OpenAI API version
  auth                      text          NOT NULL DEFAULT 'api-key' CHECK (auth IN ('api-key', 'entra')),
  api_key_env               text
                            CHECK (api_key_env ~ '^[A-Z_][A-Z0-9_]*$'),
  effort                    text
                            CHECK (effort IN ('low', 'medium', 'high', 'xhigh', 'max')),
  temperature               numeric(3,2)  CHECK (temperature BETWEEN 0 AND 2),
  dedicated                 boolean       NOT NULL DEFAULT true,
  enabled                   boolean       NOT NULL DEFAULT true,
  is_default                boolean       NOT NULL DEFAULT false,

  -- Calibration against human labels (judges only)
  calibration_agreement     numeric(4,3)  CHECK (calibration_agreement BETWEEN 0 AND 1),
  calibration_sample_size   integer       CHECK (calibration_sample_size > 0),
  calibrated_at             timestamptz,

  notes                     text          NOT NULL DEFAULT '',
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now(),

  -- Which providers can serve which purpose. Attack generation and scoring stay
  -- inside dedicated red teaming engines (ADR 0010).
  CONSTRAINT provider_allowed_for_purpose CHECK (
       (purpose = 'judge'  AND provider IN ('simulated', 'azure-openai', 'openai-compatible', 'anthropic'))
    OR (purpose = 'attack' AND provider IN ('simulated', 'azure-redteam-service'))
  ),
  -- Provider-specific required fields
  CONSTRAINT provider_fields_present CHECK (
       provider = 'simulated'
    OR (provider IN ('azure-openai', 'openai-compatible') AND endpoint IS NOT NULL AND deployment IS NOT NULL)
    OR (provider = 'anthropic'             AND deployment IS NOT NULL)
    OR (provider = 'azure-redteam-service' AND endpoint IS NOT NULL)
  ),
  CONSTRAINT credentials_present CHECK (
       provider NOT IN ('azure-openai', 'anthropic') OR auth = 'entra' OR api_key_env IS NOT NULL
  ),
  -- Current Claude models reject sampling parameters
  CONSTRAINT no_temperature_for_claude CHECK (provider <> 'anthropic' OR temperature IS NULL),
  -- The default model of a purpose must be usable
  CONSTRAINT default_is_enabled CHECK (NOT is_default OR enabled),
  -- Calibration is recorded as a whole
  CONSTRAINT calibration_complete CHECK (
       (calibration_agreement IS NULL AND calibration_sample_size IS NULL AND calibrated_at IS NULL)
    OR (calibration_agreement IS NOT NULL AND calibration_sample_size IS NOT NULL AND calibrated_at IS NOT NULL)
  )
);

-- At most one default per purpose.
CREATE UNIQUE INDEX model_deployments_one_default ON model_deployments (purpose) WHERE is_default;
CREATE INDEX model_deployments_purpose_idx ON model_deployments (purpose, enabled);

CREATE TRIGGER model_deployments_updated_at
  BEFORE UPDATE ON model_deployments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  model_deployments IS 'Judge models and red team attack engines (framework 10.2). Never contains secrets.';
COMMENT ON COLUMN model_deployments.api_key_env           IS 'NAME of the environment variable holding the key on the API server. The key itself is never stored.';
COMMENT ON COLUMN model_deployments.dedicated             IS 'True when the deployment is not shared with production traffic (section 10.2).';
COMMENT ON COLUMN model_deployments.calibration_agreement IS 'Judge-human agreement on a labelled sample, 0-1. Below 0.8, or older than 92 days, the gate shows an advisory.';
