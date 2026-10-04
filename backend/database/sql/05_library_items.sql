-- =============================================================================
-- 05_library_items.sql
-- Test library (framework section 10.1): golden datasets, agent scenarios,
-- red team scenarios, custom attack seeds, canary sets and regression sets,
-- all versioned. The rows are the catalog; the files themselves live at
-- `path` (under ASSURANCE_LIBRARY_DIR, or restricted storage for attack
-- material).
-- =============================================================================
SET search_path = assurance;

CREATE TABLE library_items (
  id          text         PRIMARY KEY CHECK (id ~ '^LIB-[0-9]{3,}$'),
  -- NULL = shared across all applications (the API shows this as "shared")
  app_id      text         REFERENCES applications (id) ON DELETE RESTRICT,
  kind        text         NOT NULL
              CHECK (kind IN ('Golden dataset', 'Agent scenarios', 'Red team scenarios',
                              'Attack seeds', 'Canary set', 'Regression set')),
  name        text         NOT NULL,
  version     integer      NOT NULL CHECK (version >= 1),
  items       integer      NOT NULL CHECK (items >= 0),
  restricted  boolean      NOT NULL,
  coverage    text         NOT NULL DEFAULT '',
  path        text         NOT NULL,
  updated_at  timestamptz  NOT NULL DEFAULT now(),

  -- Attack material is always restricted (section 7.6), and lives in restricted storage
  CONSTRAINT attack_material_restricted CHECK (
       kind NOT IN ('Red team scenarios', 'Attack seeds', 'Canary set')
    OR (restricted AND path LIKE 'restricted://%')
  )
);

CREATE INDEX library_items_app_kind_idx ON library_items (app_id, kind);
-- Each application has at most one regression set; closing a finding adds to it
CREATE UNIQUE INDEX library_items_one_regression_set ON library_items (app_id) WHERE kind = 'Regression set';

COMMENT ON TABLE  library_items IS 'Test library catalog (framework 10.1). Files live at path; attack material in restricted storage.';
COMMENT ON COLUMN library_items.app_id     IS 'Owning application; NULL means shared across applications.';
COMMENT ON COLUMN library_items.items      IS 'Number of cases, scenarios, seeds or canaries in this version.';
COMMENT ON COLUMN library_items.restricted IS 'Restricted items are visible to Security analysts and authorized testers only (section 7.6).';
COMMENT ON COLUMN library_items.path       IS 'File location, relative to ASSURANCE_LIBRARY_DIR, or restricted://... for attack material.';
