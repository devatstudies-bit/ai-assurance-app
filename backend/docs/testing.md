# Testing

```bash
cd backend
.venv/bin/python -m pytest            # 23 tests, about 4 seconds
.venv/bin/python -m pytest -k gate    # a subset
```

## How the suite is set up

`tests/conftest.py`:

- points `ASSURANCE_DATABASE_URL` at a temporary SQLite file before the app is imported;
- sets the simulated scan and evaluation durations to zero;
- the `client` fixture resets the database to the sample data before **every** test, and replaces `services.scans.launch` so scans run inline (the test sees the finished result immediately);
- `as_role("Security analyst")` returns the `X-Role` header for a role.

Evaluation tests use the `inline_evals` fixture, which does the same for evaluations.

Tests talk to the API through FastAPI's `TestClient`, so they cover routing, validation, permissions, services and persistence together. They depend on the sample data, so test names and assertions refer to sample IDs such as `FND-0231` and `uc-peopledesk-assistant`.

## What is covered

| File | Covers |
|---|---|
| `test_api.py` | Snapshot contents; the sample gate result; closing requires a regression test; lifecycle and role rules; severity changes the deadline; **the full loop** (close findings → release scan → gate passes → gate run → sign-offs → evidence pack); sign-off refused while blocked; scan validation and automatic findings; threshold editing rules; redaction for product teams; manual session rules; registering an application |
| `test_models_and_evaluations.py` | Registry listing and secret handling; model validation and management rules; connection test reports a missing key; a simulated evaluation becomes the evaluation of record; stale judge calibration gives an advisory; missing key fails fast; wrong model kind is refused; **the real Azure OpenAI judge path** against a mocked endpoint (request URL, headers, body, every metric, gate impact); **the Anthropic request shape and refusal handling** against a mocked transport; scans record the selected engine; the Azure engine fails cleanly when its SDK is not installed |

## Testing model calls without keys

No test calls a real model. Two techniques are used:

- **OpenAI-style providers** use `httpx`. The test replaces `httpx.Client` in `app.llm.client` with one built on `httpx.MockTransport`, whose handler returns canned verdicts and records each request so the test can check the URL, headers and body.
- **Anthropic** uses the official SDK, which is built on `httpx2`. The test passes `anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler))` to the client, so the real SDK builds the request and the test checks the body it sends (no `temperature`, `output_config.effort`, JSON schema format, `fallbacks: "default"`, the beta header) and how a `refusal` stop reason is handled.

## Adding a test

1. Use the `client` fixture; add `inline_evals` if your test starts an evaluation.
2. Act through the API with the role that would really do it (`headers=as_role(...)`).
3. Assert on API responses, not database rows, unless the behavior is only visible in the database.
4. For a new provider, mock its transport the same way and assert on the request it sends.

## Not covered by automated tests

- A live Azure OpenAI or Anthropic judge, and a live Azure AI Red Teaming Agent project.
- Calls to a real application sandbox.
- Concurrency under load, Postgres, and restarts while runs are in progress.

The web client has no automated tests in the repository. It has been checked with scripted browser runs during development; see `../web/docs/testing.md`.
