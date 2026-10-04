# Setup guide

This guide takes you from a fresh checkout to a running API, then through configuring real judge models, the Azure AI Red Teaming Agent, another database, and your own datasets.

## 1. Prerequisites

| Need | Version | Check |
|---|---|---|
| Python | 3.11 or later | `python3 --version` |
| pip and venv | bundled with Python | `python3 -m venv --help` |
| Node.js (only for the web client) | 20 or later | `node -v` |

No database server is needed for local use: SQLite is the default and the file is created on first start.

## 2. Install and run

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt     # app + pytest
.venv/bin/uvicorn app.main:app --reload            # http://localhost:8000
```

On Windows use `.venv\Scripts\pip` and `.venv\Scripts\uvicorn`.

Check it is up:

```bash
curl http://localhost:8000/api/health
# {"status":"ok"}
```

Interactive API docs: **http://localhost:8000/docs** (Swagger UI) and **/redoc**.

On first start the database `assurance.db` is created and loaded with the sample portfolio: six applications, scans, findings, evaluation runs, and the sample judge and attack models. Everything works offline: the default judge and attack engine are simulated and make no network calls.

### Run the web client against it

```bash
cd ../web
npm install
npm run dev        # http://localhost:5173, proxies /api to :8000
```

See `../web/docs/setup.md` for the client's options.

## 3. Configuration

All settings are environment variables with the `ASSURANCE_` prefix, or lines in `backend/.env` (copy `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `ASSURANCE_DATABASE_URL` | `sqlite:///./assurance.db` | Any SQLAlchemy URL |
| `ASSURANCE_CORS_ORIGINS` | `["http://localhost:5173","http://localhost:4173"]` | Browser origins allowed to call the API (JSON list) |
| `ASSURANCE_SEED_ON_STARTUP` | `true` | Load sample data when the database is empty |
| `ASSURANCE_ALLOW_ROLE_HEADER` | `true` | Accept the `X-Role` header (development only, see §8) |
| `ASSURANCE_LIBRARY_DIR` | `./library` | Root folder for test library files |
| `ASSURANCE_SIMULATED_SCAN_SECONDS` | `6` | Duration of a simulated scan |
| `ASSURANCE_SIMULATED_EVAL_SECONDS` | `4` | Duration of a simulated evaluation |
| `ASSURANCE_AZURE_ATTACK_OBJECTIVES` | `10` | Objectives per risk category for the Azure AI Red Teaming Agent |
| `ASSURANCE_LLM_MAX_WORKERS` | `4` | Parallel judge calls per evaluation run |
| `ASSURANCE_LLM_TIMEOUT_SECONDS` | `120` | Timeout for one model or target call |

**Model keys are not `ASSURANCE_` settings.** Each judge model names its own environment variable (for example `AZURE_OPENAI_JUDGE_KEY` or `ANTHROPIC_API_KEY`). Set those variables in the API server's environment. The API never stores or returns key values.

## 4. Configure a real judge model

Judge models are managed in the app (**AI models** page) or through the API. Roles: only the *AI platform engineer* can add or change models.

### 4.1 Azure OpenAI

1. Create a **dedicated** deployment for judging (§10.2: not shared with production traffic), for example `judge-gpt-4.1`.
2. Put its key in the API server's environment:
   ```bash
   export AZURE_OPENAI_JUDGE_KEY=<key>
   ```
   Or use Entra ID: set the model's authentication to *Entra ID* and install `azure-identity` (`pip install -r requirements-azure.txt`). The server's identity needs the *Cognitive Services OpenAI User* role on the resource.
3. Edit the sample *GPT-4.1 judge* (or add a model) with your endpoint `https://<resource>.openai.azure.com`, deployment name, pinned model version and API version.
4. Click **Test**. A green result means the endpoint, deployment and credentials work.

### 4.2 Anthropic (Claude)

```bash
export ANTHROPIC_API_KEY=<key>
```

The sample *Claude Opus 5.5 judge* uses model `claude-opus-5-5` with effort `medium`. Leave temperature empty: current Claude models reject sampling parameters, and the API refuses to save one for an Anthropic model. On the Claude API the client opts into server-side refusal fallback, so a declined request is retried on Anthropic's recommended model. To route through another endpoint (for example Claude on Microsoft Foundry), set the model's endpoint; the fallback option is then left off.

### 4.3 Any OpenAI-compatible endpoint

For OpenAI, a Foundry serverless deployment, vLLM, Ollama and similar: set provider *OpenAI-compatible*, the base URL (the part before `/chat/completions`), the model name, and optionally the key variable.

### 4.4 Make it the default and calibrate it

- **Make default** sets the judge used when a run does not name one.
- Record **calibration** (judge-human agreement on a labelled sample, sample size, date) when you edit the model. A release scored by a judge below 80% agreement, or calibrated more than 92 days ago, gets an advisory on the gate (§12.2).

### 4.5 Run an evaluation with it

In the app: open an application → **Run evaluation** → choose the judge. Or with the API:

```bash
curl -X POST localhost:8000/api/evaluations \
  -H 'Content-Type: application/json' -H 'X-Role: AI platform engineer' \
  -d '{"appId":"uc-peopledesk-assistant","judgeModelId":"judge-gpt-41"}'
```

If the key variable is missing, the run fails at once with a message that names the variable.

## 5. Configure the Azure AI Red Teaming Agent

```bash
.venv/bin/pip install -r requirements-azure.txt   # azure-ai-evaluation[redteam], azure-identity
az login                                           # or a managed identity on the server
```

Then edit one of the sample attack engines (*Azure AI Red Teaming Agent (East US)*) or add one with provider *Azure AI Red Teaming Agent* and your Foundry **project endpoint**. Register one engine per project, for example one per region for data residency. Choose it under **Run scan**.

The adapter sends attacks to the application's sandbox at `https://<sandbox>/chat` with `{"messages":[{"role":"user","content":"..."}]}` and expects `{"answer":"..."}`. If your applications expose a different interface, change `app/adapters/target.py`.

> The Azure adapter has not yet been run against a live Foundry project. The SDK's names have changed between releases; check the category and strategy mapping in `app/adapters/azure_redteam.py` against the version you pin before relying on it for gating.

## 6. Use your own datasets

Evaluation runs read the JSONL file at the path recorded on the test library item, under `ASSURANCE_LIBRARY_DIR`. For example, the PeopleDesk golden set is `library/datasets/uc-peopledesk-assistant/v5.jsonl`.

One JSON object per line. Fields depend on the application's profile:

| Profile | Fields per case |
|---|---|
| RAG (`rag-standard@v1`) | `id`, `query`, `context`, `response`, `groundTruth`, `facts[]`, `answerable` (default true), `retrievedIds[]`, `relevantIds[]` |
| Agent / multi-agent | `id`, `query`, `instructions`, `response`, `runs[]` (extra runs for pass^k), `toolCalls[]`, `expectedToolCalls[]`, `steps`, `stepBudget` |
| MCP server | `id`, `tool`, `expectedTool`, `ok`, `conformant`, `definitionHash`, `approvedHash` |
| Chat | `id`, `query`, `response`, `styleGuide` |

If a case has no `response`, the engine sends `query` to the application's sandbox and evaluates the live answer. Recorded responses let you evaluate without a running application.

The sample files contain 3 to 6 synthetic cases each so you can try a real judge cheaply. Replace them with your real golden sets.

## 7. Use PostgreSQL (or another database)

```bash
.venv/bin/pip install "psycopg[binary]"
export ASSURANCE_DATABASE_URL=postgresql+psycopg://user:password@host:5432/assurance
```

Tables are created on startup. There is no migration tool yet. Adding Alembic is the first step before schema changes in a shared environment (see [operations](operations.md#known-gaps)).

## 8. Identity

With `ASSURANCE_ALLOW_ROLE_HEADER=true`, a caller picks its role with `X-Role: Security analyst`. Without the header the API treats the caller as *AI platform engineer*. This is convenient for local work and **must be disabled in any shared environment**. Replace `current_user` in `app/security.py` with Entra ID token validation that maps app roles to the six framework roles. Route handlers do not change.

## 9. Reset and inspect data

```bash
# Reset to sample data (needs AI platform or governance role)
curl -X POST localhost:8000/api/admin/reset -H 'X-Role: AI platform engineer'

# Or delete the file and restart
rm assurance.db*

# Inspect
sqlite3 assurance.db "select id, status, severity from findings;"
```

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Web client says *Cannot reach the AI Assurance API* | The API is not running on :8000, or `API_URL` points elsewhere. Start uvicorn; check `curl localhost:8000/api/health`. |
| Browser console shows a CORS error | Calling the API directly from another origin. Add it to `ASSURANCE_CORS_ORIGINS`, or use the Vite proxy (default). |
| Evaluation fails with *environment variable … is not set* | Set that variable in the shell or service that runs uvicorn, then restart it. `--reload` does not pick up new environment variables. |
| Evaluation fails with *Dataset file not found* | Put the JSONL file at `ASSURANCE_LIBRARY_DIR/<path on the library item>`. |
| *N of M judge calls failed* | The judge endpoint is rejecting most calls: wrong deployment name, API version or quota. **Test** on the AI models page shows the exact error. |
| Azure scan fails immediately | `requirements-azure.txt` is not installed, the engine has no project endpoint, or `DefaultAzureCredential` cannot sign in. |
| A run stays *Running* after a restart | Runs are in-process threads; a restart abandons them. Start a new run. |
| `database is locked` with SQLite | Rare under WAL. Use one uvicorn worker with SQLite, or switch to Postgres for concurrency. |
