# ADR 0006: Permissions mirrored in the client for display only

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The server enforces every permission. Without any client knowledge of permissions, users would see buttons that always fail.

## Decision

Keep a copy of the role → permission table in `domain/framework.ts` (`can`, `canSignOff`) and use it only to hide or disable controls. Never use it to decide an outcome. The server's response is final.

## Consequences

- Users mostly see only what they can do.
- The two tables must be kept identical by hand; when they drift, the server refuses the action and the user sees why, so the failure is visible rather than silent.
- A later improvement is to read permissions from `GET /api/me` instead of keeping a copy.

## Alternatives considered

- **Read `GET /api/me` at startup**: removes the copy. A good next step, not done yet.
- **No client checks**: worse experience.
