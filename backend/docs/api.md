# API reference

Base URL: `http://localhost:8000` in development. Interactive, always-current reference: **`/docs`** (Swagger UI) and **`/redoc`**, generated from the code. This page explains what the endpoints do and the rules behind them.

## Conventions

- JSON in and out; field names are **camelCase**.
- Request bodies reject unknown fields (`422`).
- Caller role: `X-Role: <role>` in development ([setup §8](setup.md#8-identity)). Missing header = *AI platform engineer*.
- Errors: `{"detail": "<message for people>"}` with 400, 403, 404, 409 or 422 ([architecture §3](architecture.md#3-request-lifecycle)).
- Long-running work returns **202 Accepted** with the created record in status `Running`; poll its GET endpoint.

Example:

```bash
curl -s localhost:8000/api/applications/uc-peopledesk-assistant/gate -H 'X-Role: Auditor'
```

## Health and identity

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | `{"status":"ok"}` |
| GET | `/api/me` | any role | `{role, user, permissions[]}` |
| GET | `/api/state` | any role | The full snapshot the web client renders, redacted for the role |

## Application registry

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/applications` | any | Each item includes `gate` |
| GET | `/api/applications/{id}` | any | |
| POST | `/api/applications` | register apps | Body: `name, type, tier, owner, ecMember?, description?, entryPoints[], threats[]`. Starts in stage *Design*. `409` if the id exists. |
| GET | `/api/applications/{id}/gate` | any | Evaluate without recording |
| POST | `/api/applications/{id}/gate-runs` | run gate | Evaluate and record a *Release gate* run. **Use this from CI/CD.** Returns `{run, gate}`. |
| POST | `/api/applications/{id}/sign-offs` | role in tier's sign-off list | `409` if the gate is not passing or the role already signed |
| GET | `/api/applications/{id}/evidence-pack` | any | Gate, evaluation (with judge), scan summary (with engine), findings, regression tests, runs, approvals, thresholds. No raw attack content. |

### Gating a pipeline

```bash
result=$(curl -s -X POST "$API/api/applications/uc-peopledesk-assistant/gate-runs" -H "X-Role: AI platform engineer")
echo "$result" | jq -e '.gate.passed' > /dev/null || { echo "$result" | jq '.gate.failed'; exit 1; }
```

## Evaluations

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/evaluations?app=` | any | Newest first |
| GET | `/api/evaluations/{id}` | any | Includes `caseResults` with each judge verdict and reason |
| POST | `/api/evaluations` | run scans | Body: `appId, judgeModelId?, datasetId?, mode?` (Pre-release or Online). Defaults: the default judge and the app's latest golden dataset. Returns `202`. |

Errors: `422` if the model is not a judge or the dataset is not the app's; `409` if the judge is disabled, there is no default judge, or a real judge is chosen and the app has no dataset.

## Red team scans

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/scans?app=` | any | |
| GET | `/api/scans/{id}` | any | |
| POST | `/api/scans` | run scans | Body: `appId, attackModelId?, mode?, complexities[], strategies[], categories[]?`. Returns `202`. |

`strategies` values: Baseline, Encoding, Jailbreak, Indirect, Multi-turn. `complexities`: Easy, Moderate, Difficult. Errors: `422` for unknown categories, agent-only categories on RAG or chat apps, or a judge model given as the attack model; `409` for a disabled engine.

## Findings

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/findings?app=&status=&severity=` | any | Evidence redacted by role |
| GET | `/api/findings/{id}` | any | |
| POST | `/api/findings` | log findings | Body: `appId, title, severity, category, owasp[], source, sourceRef?, evidence?` |
| PATCH | `/api/findings/{id}` | triage | Body: `owner?, severity?, workItem?`. Severity recomputes the deadline. |
| POST | `/api/findings/{id}/transitions` | move findings (accept risk for Accepted risk) | Body: `to, regressionTitle?, acceptance?{expires, controls}, note?` |

Closing example:

```bash
curl -X POST localhost:8000/api/findings/FND-0219/transitions \
  -H 'Content-Type: application/json' -H 'X-Role: Security analyst' \
  -d '{"to":"Closed","regressionTitle":"Role-play request does not reveal system instructions"}'
```

Without `regressionTitle` (and no existing regression test) this returns `422 A regression test is required to close a finding`.

## Manual testing

All require the manual-testing permission except creating a finding from an attempt (log findings).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/authorizations` | |
| GET | `/api/sessions`, `/api/sessions/{id}` | |
| POST | `/api/sessions` | Body: `appId, authorizationId, objectives[], optOuts[]?, title?`. `409` without a matching sandbox or staging authorization. |
| POST | `/api/sessions/{id}/status` | Body: `status` (Planned, Active, Completed). Active is refused after the authorization expires; Completed records the run and the app's manual test date. |
| POST | `/api/sessions/{id}/attempts` | Body: `category, technique, entry, outcome, note?`. Only while Active; opted-out categories refused. |
| POST | `/api/sessions/{id}/attempts/{attemptId}/finding` | Body: `title, severity, category, owasp[]?, evidence?`. Creates and links the finding. |

## Model registry

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/models?purpose=` | any | Includes `providerLabel` and `secretConfigured` (whether the key variable is set on the server). Never includes key values. |
| POST | `/api/models` | manage models | Body: `name, purpose, provider, endpoint?, deployment?, modelVersion?, apiVersion?, auth?, apiKeyEnv?, effort?, temperature?, dedicated?, enabled?, notes?, calibration?{agreement, sampleSize, calibratedAt}` |
| PATCH | `/api/models/{id}` | manage models | Same fields except `purpose` and `provider`. Send `null` to clear a field. |
| POST | `/api/models/{id}/default` | manage models | |
| POST | `/api/models/{id}/test` | manage models | One small call: `{ok, latencyMs, detail}` |
| DELETE | `/api/models/{id}` | manage models | `409` if it has recorded runs or is the default |

Example: register a judge served by an internal vLLM endpoint.

```bash
curl -X POST localhost:8000/api/models -H 'Content-Type: application/json' -H 'X-Role: AI platform engineer' -d '{
  "name": "Llama 3.3 70B judge", "purpose": "judge", "provider": "openai-compatible",
  "endpoint": "https://llm.internal.example/v1", "deployment": "llama-3.3-70b-instruct",
  "apiKeyEnv": "LLAMA_JUDGE_KEY", "temperature": 0
}'
```

## Reference lists and administration

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/library` | any | Restricted items masked by role |
| GET | `/api/regression-tests` | any | |
| GET | `/api/runs?app=&kind=` | any | Run history |
| GET | `/api/thresholds` | any | By tier |
| PATCH | `/api/thresholds/{tier}` | edit thresholds | Body: `maxAsrOverall?, maxAsrCategory?, complexity?, scenarios?`. Other fields are fixed. |
| POST | `/api/admin/reset` | edit thresholds | Restores the sample data for everyone. `204`. |
