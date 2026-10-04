# ADR 0008: Role chosen by header in development; Entra ID in production

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The UI needs to preview all six roles (§10.5) during development and demos, without an identity provider. Production must use real sign-in.

## Decision

`security.current_user` reads the `X-Role` header when `ASSURANCE_ALLOW_ROLE_HEADER` is true, defaulting to AI platform engineer. Every route depends on `current_user` and checks permissions with `require`. For production, replace `current_user` with Entra ID token validation that maps app roles to the six framework roles, and disable the header.

## Consequences

- Role behavior is fully testable and demonstrable today.
- The production change is one function; route handlers do not change.
- A deployment that forgets to disable the header lets anyone act as any role. The setting defaults to true for local use, so the production checklist calls it out.

## Alternatives considered

- **Integrate Entra ID from the start**: blocks local use and demos without a tenant.
