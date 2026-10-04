# ADR 0003: Hash-based routing

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The client may be hosted on static hosts or storage accounts where configuring server rewrites for deep links is inconvenient or not possible.

## Decision

Use `HashRouter`. URLs look like `/#/findings?open=FND-0231`.

## Consequences

- Deep links and reloads work on any static host with no configuration.
- URLs contain `#`. If hosting always supports rewrites, switching to `BrowserRouter` is a one-line change plus a rewrite rule.

## Alternatives considered

- **BrowserRouter**: cleaner URLs, but needs a rewrite rule on every host.
