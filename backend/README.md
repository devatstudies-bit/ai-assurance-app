# AI Assurance API

> In-depth documentation: [docs/](docs/README.md): architecture, setup, domain rules, API, data model, testing, operations and ADRs. Project overview: [../README.md](../README.md).

Python backend for the **AI Evaluation and Red Teaming Framework** (v1.0). It runs the framework rules on the server: the application registry, the unified release gate, red team scan orchestration, findings management, the manual testing workspace and evidence packs.

FastAPI · SQLAlchemy 2 · Pydantic 2 · SQLite by default (any SQLAlchemy database works).

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload          # http://localhost:8000, docs at /docs
.venv/bin/python -m pytest                         # 23 tests
```

On first start the database is created and loaded with the sample data in `app/seed_data.json`. Dates in that file are relative to today. `POST /api/admin/reset` restores the sample data.

Settings come from `ASSURANCE_*` environment variables or a `.env` file; see `.env.example`.

## Layout

| Path | What it does | Framework section |
|---|---|---|
| `app/framework.py` | Risk categories, strategies, severities and deadlines, default gate thresholds, roles and permissions | §4.1, §7.2, §8, §9, §10.5 |
| `app/gate.py` | Gate engine: returns pass or fail with a reason for each criterion | §9 |
| `app/services/findings.py` | Lifecycle transitions, deadlines, and the rule that a finding cannot close without a regression test | §8 |
| `app/services/scans.py` | Run orchestrator: starts scans, runs the adapter in the background, writes results, auto-logs findings, records runs | §10.1 |
| `app/adapters/` | Red team engines: `simulated` and `azure_redteam` (Azure AI Red Teaming Agent); `target.py` calls the app under test | §7.2, Appendix B |
| `app/llm/` | Judge client for Azure OpenAI, OpenAI-compatible endpoints and Anthropic, plus the shared judge rubrics | §6, §10.2 |
| `app/services/evaluations.py` | Evaluation runs: judge metrics through the selected judge model, deterministic metrics in code | §6 |
| `app/models.py` | Tables: RedTeamScan, Finding, applications with threat model and release, runs, library and sessions | §10.3 |
| `app/routers/` | REST endpoints | §10.4 |
| `app/security.py` | Caller role and permission checks | §10.5 |

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/state` | Everything the web client renders, filtered for the caller's role |
| `GET/POST /api/applications`, `GET /api/applications/{id}` | Registry; each application includes its computed `gate` |
| `GET /api/applications/{id}/gate`, `POST …/gate-runs` | Evaluate the gate, or evaluate and record a gate decision (for CI/CD) |
| `POST /api/applications/{id}/sign-offs` | Sign-off by a role the tier requires, only after the gate passes |
| `GET /api/applications/{id}/evidence-pack` | Release evidence for governance and audit (no raw attack content) |
| `GET/POST /api/scans`, `GET /api/scans/{id}` | Start an automated scan (`202`, then poll) and read its results |
| `GET/POST /api/findings`, `PATCH /api/findings/{id}` | Log findings; triage severity, owner and work item |
| `POST /api/findings/{id}/transitions` | Move through the lifecycle; closing needs `regressionTitle`, accepting risk needs `acceptance` |
| `GET/POST /api/sessions`, `POST …/status`, `POST …/attempts`, `POST …/attempts/{a}/finding` | Manual testing workspace |
| `GET /api/authorizations`, `/api/library`, `/api/regression-tests`, `/api/runs` | Reference lists |
| `GET/POST /api/models`, `PATCH /api/models/{id}`, `POST …/default`, `POST …/test`, `DELETE` | Model registry: judge models and attack engines |
| `GET/POST /api/evaluations`, `GET /api/evaluations/{id}` | Run an evaluation with a chosen judge (`202`, then poll); results include each judge verdict and its reason |
| `GET /api/thresholds`, `PATCH /api/thresholds/{tier}` | Gate thresholds; only the ASR limits, complexity and scenario rule can be edited |

### Rules enforced on the server

- **Gate (§9):** evaluation metrics, content safety, pass^k for agents, scan complexity coverage, overall and per-category attack success rate (ASR), scenarios, canary leaks, open critical and high findings, and manual test recency.
- **Lifecycle (§8.2):** New → Triaged → In fix → Retest pending → Closed. Retest can send a finding back to In fix. Triage is done by Security. Closing creates the regression test and adds it to the application's regression set. Only governance can accept risk, and it needs an expiry date and compensating controls.
- **Scans:** the target is always the application's registered sandbox. Agent-only categories are refused for RAG and chat applications. A category over its limit with no open finding logs a finding automatically. A release scan becomes the release's scan of record.
- **Manual testing (§7.6):** a session needs a written authorization for the same application, limited to sandbox or staging and still in date. Opted-out harm categories cannot be logged.
- **Access (§10.5):** Product team roles see finding summaries only. Restricted library paths are masked. The manual workspace is limited to Security analysts.

## Identity

In development the web client sends the role being previewed in an `X-Role` header. For production, set `ASSURANCE_ALLOW_ROLE_HEADER=false` and replace `current_user` in `app/security.py` with Entra ID token validation that maps app roles to the six framework roles. Route handlers do not change.

## Judge models and attack engines

Models are managed on the **AI models** page or through `/api/models`. Each evaluation run picks a judge and each scan picks an attack engine; the default for each is used when none is chosen. Every run records the model that scored or ran it, and models with recorded runs can be disabled but not deleted, so evidence keeps its provenance.

| Purpose | Providers | What it does |
|---|---|---|
| Judge | Azure OpenAI, OpenAI-compatible, Anthropic, simulated | Scores the judge metrics of an evaluation run against shared rubrics (`app/llm/judge.py`). Anthropic calls use the official SDK with structured output, `effort` instead of temperature, and server-side refusal fallback. |
| Attack | Azure AI Red Teaming Agent (hosted), simulated | Runs the automated scan; the hosted agent generates and scores attacks in its Foundry project. Register one entry per Foundry project, for example per region. |

**Secrets are never stored.** A model names the environment variable that holds its key (`AZURE_OPENAI_JUDGE_KEY`, `ANTHROPIC_API_KEY`, …), or uses Entra ID. **Test** on the models page makes one small call to check the endpoint, deployment and credentials.

**Calibration (§12.2).** Record judge–human agreement for each judge. A release scored by a judge with agreement below 80%, or last calibrated more than 92 days ago, gets an advisory "Judge calibration" row on the gate. It does not block release.

**Datasets.** Evaluation runs read the JSONL file at the path recorded on the test-library item, under `ASSURANCE_LIBRARY_DIR` (default `./library`). The sample files are short excerpts with recorded responses, so you can try a real judge with only its key. A case without a `response` is sent live to the app's sandbox (`app/adapters/target.py`). Field reference:

| Profile | Fields per case |
|---|---|
| RAG | `query`, `context`, `response`, `groundTruth`, `facts[]`, `answerable`, `retrievedIds[]`, `relevantIds[]` |
| Agent / multi-agent | `query`, `instructions`, `response`, `runs[]` (extra runs for pass^k), `toolCalls[]`, `expectedToolCalls[]`, `steps`, `stepBudget` |
| MCP server | `tool`, `expectedTool`, `ok`, `conformant`, `definitionHash`, `approvedHash` |
| Chat | `query`, `response`, `styleGuide` |

The simulated judge reuses the release's last scores with small variation and makes no model calls, so the app works without any keys.

## Azure AI Red Teaming Agent

```bash
.venv/bin/pip install -r requirements-azure.txt
```

Then register an attack engine with provider *Azure AI Red Teaming Agent* and its Foundry project endpoint. It authenticates with `DefaultAzureCredential`.

`app/adapters/azure_redteam.py` maps framework categories and strategy groups to `RiskCategory` and `AttackStrategy`. It calls the app's sandbox at `https://<sandbox>/chat` with `{"messages": [{"role": "user", "content": …}]}` (see `app/adapters/target.py`) and builds the heat map from the attack details in the result. **This adapter has not been run against a live Foundry project.** The SDK's enum members and result fields have changed between releases, so check the mapping and the target contract against the SDK version you pin before using it for gating. Scenario attacks run through the evaluation harness, so the adapter carries the latest scenario results forward.
