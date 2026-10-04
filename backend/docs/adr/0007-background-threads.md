# ADR 0007: Background runs on in-process threads

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Scans and evaluations take seconds to minutes. The service is deployed as a single instance for now.

## Decision

Start each run on a daemon thread. The thread captures its inputs, closes its database session, calls the engine, writes progress in short sessions, and records completion or failure. The HTTP request returns `202` immediately.

## Consequences

- No queue infrastructure to run or operate.
- Runs in progress are lost on restart and stay *Running*.
- The service cannot scale beyond one replica safely.
- Moving to a queue only changes the two `launch` functions; the run functions already take just an ID.

## Alternatives considered

- **A durable queue** (Azure Service Bus with Container Apps Jobs, or Celery): the production target, listed in operations.
- **asyncio tasks**: the engines and SDKs used are largely synchronous, so threads are simpler.
