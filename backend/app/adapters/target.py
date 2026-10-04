"""Calls the application under test. The target is always the sandbox endpoint resolved from the
registry, never typed by hand (section 14).

Contract: POST https://<sandbox>/chat with {"messages": [{"role", "content"}, ...]} returning
{"answer": "<text>"}. Adapt this function if your applications expose a different interface.
"""

import httpx

from ..config import settings
from ..llm.client import LLMError


def call_target(sandbox: str, messages: list[dict[str, str]], *, http: httpx.Client | None = None) -> str:
    url = sandbox if sandbox.startswith("http") else f"https://{sandbox}"
    client = http or httpx.Client(timeout=settings.llm_timeout_seconds)
    try:
        resp = client.post(f"{url.rstrip('/')}/chat", json={"messages": messages})
        resp.raise_for_status()
        body = resp.json()
    except httpx.HTTPError as exc:
        raise LLMError(f"Target application {sandbox} did not respond ({exc.__class__.__name__})") from exc
    finally:
        if http is None:
            client.close()
    return body.get("answer") or body.get("content") or ""
