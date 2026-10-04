# ADR 0001: React, TypeScript and Vite

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The client is a data-heavy internal application with many interactive screens (boards, drawers, dialogs, charts) that must stay consistent with a typed API.

## Decision

Build a single-page application with React 19, TypeScript (with unused-code and fallthrough checks), and Vite for development and builds. Use React Router for navigation and lucide-react for icons.

## Consequences

- Widely known stack; fast development server and builds.
- TypeScript types for every API response catch drift at build time.
- A static build that any static host can serve.
- No server-side rendering. That is acceptable for an internal tool behind sign-in.

## Alternatives considered

- **Next.js**: server rendering and routing conventions are not needed for an internal SPA behind sign-in, and would add a server to run.
- **Angular**: heavier for a small team; React was the more common skill.
