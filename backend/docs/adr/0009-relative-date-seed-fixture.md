# ADR 0009: Sample data as a fixture with relative dates

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The sample story depends on time: a critical finding due tomorrow, a manual test 14 days ago, a judge calibrated 130 days ago. Fixed dates would make the sample go stale (everything overdue) within weeks.

## Decision

Keep sample data in `app/seed_data.json` with dates written as `@rel:<days>:<hour>`, decoded relative to the day the database is created. `seed.py` loads it when the database is empty and adds the sample models and evaluation runs. The fixture was generated once from the original TypeScript sample data.

## Consequences

- The sample always looks current, and tests can assert on it.
- `POST /api/admin/reset` and deleting the database both restore it.
- Production must set `ASSURANCE_SEED_ON_STARTUP=false`.

## Alternatives considered

- **Fixed dates**: go stale.
- **A seeding script with dates computed in code**: harder to read and edit than data.
