# Architecture decision records

Each record explains one significant decision: the context, what was decided, and the consequences. Records are not edited after acceptance; a later record supersedes an earlier one. Copy [template.md](template.md) for a new one.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-python-fastapi.md) | Python and FastAPI for the backend | Accepted |
| [0002](0002-sqlalchemy-sqlite-json-columns.md) | SQLAlchemy with SQLite by default, JSON columns for nested structures | Accepted |
| [0003](0003-server-authoritative-rules.md) | All framework rules are enforced on the server | Accepted |
| [0004](0004-snapshot-endpoint.md) | One role-filtered snapshot endpoint for the web client | Accepted |
| [0005](0005-model-registry-and-secrets.md) | A model registry for judge and attack models; secrets referenced, never stored | Accepted |
| [0006](0006-own-judge-rubrics.md) | Our own judge rubrics over a provider-neutral client | Accepted |
| [0007](0007-background-threads.md) | Background runs on in-process threads | Accepted |
| [0008](0008-role-header-in-development.md) | Role chosen by header in development; Entra ID in production | Accepted |
| [0009](0009-relative-date-seed-fixture.md) | Sample data as a fixture with relative dates | Accepted |
| [0010](0010-attack-engines.md) | Attack generation stays inside dedicated red teaming engines | Accepted |
