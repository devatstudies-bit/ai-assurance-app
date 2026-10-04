# ADR 0005: A model registry for judge and attack models; secrets referenced, never stored

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The framework requires dedicated, version-pinned judge and attack deployments, separate from production (§10.2), and judge calibration (§12.2). Users need to choose a judge per evaluation and an engine per scan, and to compare judges from different model families.

## Decision

Store judge and attack models in a `model_deployments` table managed through `/api/models` and the AI models page. Each model records provider, endpoint, deployment, pinned version, authentication, calibration, whether it is dedicated, and the **name** of the environment variable that holds its key. The key value is read from the server's environment at call time and is never stored, returned or logged. Each run snapshots the configuration of the model that produced it.

## Consequences

- Keys can live in Key Vault-backed settings or be replaced with managed identity (`auth = entra`) without code changes.
- The UI can show whether a key is configured (`secretConfigured`) without seeing it.
- Evidence keeps provenance: a model with recorded runs can be disabled but not deleted, and each run's snapshot survives later edits.
- Adding a key requires access to the server's environment, not just the UI; this is deliberate.

## Alternatives considered

- **Store encrypted keys in the database**: puts secret management inside this service and its backups.
- **One judge configured in settings**: no per-run choice and no way to compare judges.
