# AI Assurance API: documentation

The backend is a Python service (FastAPI, SQLAlchemy, Pydantic) that runs the rules of the *AI Evaluation and Red Teaming Framework v1.0*. It holds every record, enforces every rule, runs evaluations and red team scans in the background, and serves one JSON API to the web client in `../web`.

| Document | Read it when you want to… |
|---|---|
| [Setup guide](setup.md) | Install, run, configure judges and attack engines, switch databases, fix common problems |
| [Architecture](architecture.md) | Understand the components, how a request flows, how background runs work |
| [Domain rules](domain-rules.md) | Know exactly what the gate checks, how findings move, who can do what, which metrics each app type gets |
| [Data model](data-model.md) | See every table and column, and the JSON shapes stored inside them |
| [PostgreSQL schema scripts](../database/README.md) | Create the production database: target schema with foreign keys, constraints, audit tables, reporting views and roles |
| [API reference](api.md) | Call an endpoint: parameters, permissions, errors, examples |
| [Testing](testing.md) | Run and extend the test suite |
| [Operations and production readiness](operations.md) | Deploy it, harden it, and see what is not production-ready yet |
| [Architecture decision records](adr/README.md) | Understand why it is built this way |

Framework section numbers (for example §9 for the release gate) refer to `AI_Evaluation_and_Red_Teaming_Framework.pdf` at the repository root.

## Code map

```
backend/
├── app/
│   ├── main.py              FastAPI app, CORS, router registration, startup seeding
│   ├── config.py            Settings (ASSURANCE_* environment variables)
│   ├── db.py                SQLAlchemy engine and session
│   ├── models.py            Tables (§10.3 data model plus model registry and evaluation runs)
│   ├── schemas.py           Request bodies (Pydantic, camelCase)
│   ├── serialize.py         Row → JSON, including role-based redaction
│   ├── security.py          Caller identity and permission checks
│   ├── framework.py         Reference data: categories, severities, thresholds, roles, profiles
│   ├── gate.py              Release gate engine (§9)
│   ├── util.py              Time helpers and the shared ID sequence
│   ├── seed.py, seed_data.json   Sample data, dates relative to today
│   ├── routers/             HTTP endpoints, one module per area
│   ├── services/            Workflows: findings lifecycle, scan runs, evaluation runs
│   ├── adapters/            Red team engines and the call to the app under test
│   └── llm/                 Judge client (Azure OpenAI, OpenAI-compatible, Anthropic) and rubrics
├── database/                PostgreSQL schema scripts (target production schema)
├── library/                 Test library files (golden datasets, scenarios) as JSONL
├── tests/                   pytest suite
└── docs/                    This documentation
```
