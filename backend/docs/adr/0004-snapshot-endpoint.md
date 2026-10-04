# ADR 0004: One role-filtered snapshot endpoint for the web client

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Every screen cross-references several collections: the dashboard combines applications, gates, scans, findings and runs; closing a finding changes the gate, the board and the dashboard together. The portfolio is small (tens of applications).

## Decision

Provide `GET /api/state`, returning everything the client renders, filtered and redacted for the caller's role. After every action the client refetches it, and it polls it every second while a scan or evaluation runs. Large detail (evaluation case results) is excluded and loaded on demand. Granular endpoints remain for pipelines and integrations.

## Consequences

- The client has one simple store and never shows a half-updated view.
- Redaction is applied in one place for the whole snapshot.
- The response grows with the portfolio and every action refetches all of it. That is fine for tens of applications and needs revisiting (pagination, per-screen endpoints, or a cache with targeted invalidation) before hundreds.

## Alternatives considered

- **Per-screen endpoints with a client cache** (for example React Query): more efficient at scale, but more code and more chances of stale views today.
- **Server push** (WebSockets or SSE) for run progress: better than polling at scale; polling is sufficient while runs are few.
