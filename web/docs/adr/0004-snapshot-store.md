# ADR 0004: One store fed by the API snapshot; every action refreshes it

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The first version kept all data in the browser with a reducer. Once the API became the source of truth, the client needed a way to stay consistent after every action, because one action (closing a finding) changes several screens (gate, board, dashboard).

## Decision

`StoreProvider` loads `GET /api/state` for the current role and exposes it as `state`. Each `api.*` action calls its endpoint, then refetches the snapshot. Errors are shown as toasts with the server's message. While a scan or evaluation is running, the store polls every second. Large detail is loaded on demand by the screen that needs it.

## Consequences

- Screens are simple: read `state`, call `api.x()`, handle success.
- No cache invalidation logic and no stale screens.
- Every action costs a full snapshot fetch. That is fine at the current size; see the backend's ADR 0004 for when to revisit.

## Alternatives considered

- **React Query or SWR with per-screen queries**: more efficient at scale, but each action must know which queries to invalidate.
- **Keep the reducer and sync it**: two sources of truth.
