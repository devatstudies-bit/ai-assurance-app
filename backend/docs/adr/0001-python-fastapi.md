# ADR 0001: Python and FastAPI for the backend

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The framework places the evaluation and red team engine in "a Python package built on the Azure AI Evaluation SDK, including the red team extra" (§10.2), and Appendix B shows the scan in Python. The service needs typed request validation, generated API documentation, and simple background work.

## Decision

Build the backend in Python 3.11+ with FastAPI, Pydantic 2 for request validation and settings, and SQLAlchemy 2 for persistence.

## Consequences

- The Azure AI Evaluation SDK, `azure-identity` and the Anthropic SDK are used directly, with no bridge between languages.
- OpenAPI documentation (`/docs`) is generated from the code and stays current.
- Request bodies are validated by Pydantic models with camelCase aliases, so the API matches the TypeScript client's naming.
- The team needs Python skills alongside the TypeScript front end.

## Alternatives considered

- **Node.js / TypeScript backend** (one language across the stack): rejected because the evaluation and red team SDKs are Python-first.
- **Django**: more built in (admin, ORM, migrations) but heavier, and its synchronous request model fits a JSON API less naturally.
- **Flask**: lighter, but validation and API docs would need extra libraries.
