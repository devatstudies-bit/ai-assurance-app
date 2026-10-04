# ADR 0002: SQLAlchemy with SQLite by default, JSON columns for nested structures

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The service must run locally with no infrastructure, and in production on a managed database. Several structures are always read and written whole: a release's metrics, a scan's heat map and scenario results, a finding's history, an evaluation's case results.

## Decision

Use SQLAlchemy 2 with `sqlite:///./assurance.db` as the default and any SQLAlchemy URL through `ASSURANCE_DATABASE_URL`. Store whole-object structures as JSON columns, in the same camelCase shape the API returns. Store timestamps as ISO-8601 UTC strings.

## Consequences

- Zero setup locally; Postgres in production by changing one variable.
- Fewer tables and joins; the API returns the JSON almost unchanged.
- JSON columns cannot be queried or indexed as easily. That is acceptable because nothing filters on their contents; if reporting needs it, extract the fields into tables.
- ISO strings sort and compare correctly as text and match the browser's format exactly.
- No foreign keys are declared, so deletes are guarded by API rules instead.

## Alternatives considered

- **Fully normalized tables** for metrics, heat cells and history entries: more joins and code for no current benefit.
- **A document database**: would fit the JSON shapes but adds infrastructure and loses SQL for the relational parts (findings, runs, registry).
