# ADR 0003: All framework rules are enforced on the server

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The first version of the web client ran entirely in the browser, with the gate engine and lifecycle rules in TypeScript. That cannot be trusted for release decisions: any user could change the rules or the data in their browser, and pipelines could not use the gate.

## Decision

The backend is the single source of truth. The gate engine, findings lifecycle, permissions, scan and evaluation workflows and manual-testing safety rules run only on the server. The client shows the server's results (each application carries its computed `gate`) and sends requests. It mirrors permissions only to disable buttons in advance; the server still checks every request.

## Consequences

- CI/CD can call `POST /api/applications/{id}/gate-runs` and get the same decision the UI shows.
- The evidence pack reflects what was enforced, not what a browser displayed.
- A rule change happens in one place (`gate.py`, `services/*`).
- The client needs the API to work; it shows a "Cannot reach the API" screen otherwise.

## Alternatives considered

- **Keep the rules in both places**: they would drift, and the client's copy would never be authoritative.
