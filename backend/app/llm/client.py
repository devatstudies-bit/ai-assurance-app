"""Calls judge and attack models from the registry, whatever their provider.

- azure-openai: Azure OpenAI chat completions (api-key or Entra ID via azure-identity)
- openai-compatible: any /chat/completions endpoint (OpenAI, Foundry serverless, vLLM, Ollama, ...)
- anthropic: Claude through the official Anthropic SDK
Used for judge models. Secrets are read at call time from the environment variable named in `api_key_env`; they are never stored.
"""

import json
import os
import re
import time
from typing import Any

import httpx

from ..config import settings
from ..models import ModelDeployment

Message = dict[str, str]  # {"role": "user" | "assistant", "content": str}


class LLMError(Exception):
    """A model call failed: bad configuration, missing secret, network or provider error."""


class LLMRefusal(LLMError):
    """The model declined the request (for example a safety refusal on an attack prompt)."""


def _secret(m: ModelDeployment) -> str:
    if not m.api_key_env:
        raise LLMError(f"{m.name}: no API key variable configured")
    value = os.environ.get(m.api_key_env)
    if not value:
        raise LLMError(f"{m.name}: environment variable {m.api_key_env} is not set on the API server")
    return value


def secret_configured(m: ModelDeployment) -> bool:
    if m.provider in ("simulated", "azure-redteam-service"):
        return True
    if m.provider == "azure-openai" and m.auth == "entra":
        return True
    return bool(m.api_key_env and os.environ.get(m.api_key_env))


def _parse_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        hit = re.search(r"\{.*\}", text, re.S)
        if hit:
            try:
                return json.loads(hit[0])
            except json.JSONDecodeError:
                pass
    raise LLMError(f"Model did not return valid JSON: {text[:200]!r}")


# ---------- OpenAI-style providers ----------

def _azure_headers(m: ModelDeployment) -> dict[str, str]:
    if m.auth == "entra":
        try:
            from azure.identity import DefaultAzureCredential  # noqa: PLC0415
        except ImportError as exc:
            raise LLMError("Entra ID auth needs azure-identity: pip install -r requirements-azure.txt") from exc
        token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
        return {"Authorization": f"Bearer {token}"}
    return {"api-key": _secret(m)}


def _openai_style(m: ModelDeployment, system: str | None, messages: list[Message], json_mode: bool, http: httpx.Client | None) -> str:
    if not m.endpoint or not m.deployment:
        raise LLMError(f"{m.name}: endpoint and deployment are required")
    msgs = ([{"role": "system", "content": system}] if system else []) + messages
    body: dict[str, Any] = {"messages": msgs, "max_completion_tokens": 4000}
    if m.temperature is not None:
        body["temperature"] = m.temperature
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    base = m.endpoint.rstrip("/")
    if m.provider == "azure-openai":
        url = f"{base}/openai/deployments/{m.deployment}/chat/completions"
        params = {"api-version": m.api_version or "2024-10-21"}
        headers = _azure_headers(m)
    else:
        url, params = f"{base}/chat/completions", {}
        body["model"] = m.deployment
        headers = {"Authorization": f"Bearer {_secret(m)}"} if m.api_key_env else {}

    client = http or httpx.Client(timeout=settings.llm_timeout_seconds)
    try:
        resp = client.post(url, params=params, headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise LLMError(f"{m.name}: cannot reach {base} ({exc.__class__.__name__})") from exc
    finally:
        if http is None:
            client.close()
    if resp.status_code >= 400:
        detail = resp.text[:300]
        if resp.status_code == 400 and "content_filter" in detail:
            raise LLMRefusal(f"{m.name}: blocked by the provider content filter")
        raise LLMError(f"{m.name}: HTTP {resp.status_code} {detail}")
    choice = resp.json()["choices"][0]
    if choice.get("finish_reason") == "content_filter":
        raise LLMRefusal(f"{m.name}: response blocked by the provider content filter")
    return choice["message"].get("content") or ""


# ---------- Anthropic ----------

def _anthropic(m: ModelDeployment, system: str | None, messages: list[Message], schema: dict | None, http: Any) -> str:
    # `http`, when given, must be an httpx2 client (anthropic 1.x is built on httpx2), e.g. anthropic.DefaultHttpxClient(...)
    import anthropic  # noqa: PLC0415

    kwargs: dict[str, Any] = {"api_key": _secret(m), "timeout": settings.llm_timeout_seconds, "max_retries": 2}
    if m.endpoint:
        kwargs["base_url"] = m.endpoint
    if http is not None:
        kwargs["http_client"] = http
    client = anthropic.Anthropic(**kwargs)

    output_config: dict[str, Any] = {}
    if m.effort:
        output_config["effort"] = m.effort
    if schema:
        output_config["format"] = {"type": "json_schema", "schema": schema}

    request: dict[str, Any] = {"model": m.deployment, "max_tokens": 16000, "messages": messages}
    if system:
        request["system"] = system
    if output_config:
        request["output_config"] = output_config
    # Server-side fallback re-runs a declined request on Anthropic's recommended model (Claude API only)
    if not m.endpoint or "api.anthropic.com" in m.endpoint:
        request["betas"] = ["server-side-fallback-2026-07-01"]
        request["fallbacks"] = "default"

    try:
        response = client.beta.messages.create(**request)
    except anthropic.AuthenticationError as exc:
        raise LLMError(f"{m.name}: authentication failed; check {m.api_key_env}") from exc
    except anthropic.NotFoundError as exc:
        raise LLMError(f"{m.name}: model {m.deployment!r} not found") from exc
    except anthropic.RateLimitError as exc:
        raise LLMError(f"{m.name}: rate limited by Anthropic") from exc
    except anthropic.BadRequestError as exc:
        raise LLMError(f"{m.name}: bad request: {exc.message}") from exc
    except anthropic.APIStatusError as exc:
        raise LLMError(f"{m.name}: Anthropic API error {exc.status_code}") from exc
    except anthropic.APIConnectionError as exc:
        raise LLMError(f"{m.name}: cannot reach the Anthropic API") from exc

    if response.stop_reason == "refusal":
        category = getattr(response.stop_details, "category", None) if response.stop_details else None
        raise LLMRefusal(f"{m.name}: declined the request" + (f" ({category})" if category else ""))
    return "".join(b.text for b in response.content if b.type == "text")


# ---------- Public API ----------

def chat(m: ModelDeployment, messages: list[Message], system: str | None = None, *, http: Any = None) -> str:
    """Free-text completion. `http` is an httpx client for OpenAI-style providers, httpx2 for Anthropic."""
    if m.provider in ("azure-openai", "openai-compatible"):
        return _openai_style(m, system, messages, json_mode=False, http=http)
    if m.provider == "anthropic":
        return _anthropic(m, system, messages, None, http)
    raise LLMError(f"{m.name}: provider {m.provider} does not support direct calls")


def complete_json(m: ModelDeployment, system: str, user: str, schema: dict[str, Any], *, http: Any = None) -> dict[str, Any]:
    """Structured completion (used by judge models). Anthropic enforces `schema`; OpenAI-style providers use JSON mode."""
    messages = [{"role": "user", "content": user}]
    if m.provider in ("azure-openai", "openai-compatible"):
        prompt = f"{system}\n\nRespond with a JSON object matching this schema:\n{json.dumps(schema)}"
        return _parse_json(_openai_style(m, prompt, messages, json_mode=True, http=http))
    if m.provider == "anthropic":
        return _parse_json(_anthropic(m, system, messages, schema, http))
    raise LLMError(f"{m.name}: provider {m.provider} does not support direct calls")


def ping(m: ModelDeployment, *, http: Any = None) -> dict[str, Any]:
    """Connectivity check: one tiny structured call. Never raises."""
    started = time.monotonic()
    if m.provider == "simulated":
        return {"ok": True, "latencyMs": 0, "detail": "Simulated model; no network call made"}
    if m.provider == "azure-redteam-service":
        ok = bool(m.endpoint)
        try:
            import azure.ai.evaluation.red_team  # noqa: F401, PLC0415
            sdk = True
        except ImportError:
            sdk = False
        detail = ("Foundry project endpoint set" if ok else "Set the Foundry project endpoint") + ("; SDK installed" if sdk else "; install requirements-azure.txt")
        return {"ok": ok and sdk, "latencyMs": 0, "detail": detail}
    schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False}
    try:
        out = complete_json(m, "You are a connectivity check.", 'Reply with {"ok": true}.', schema, http=http)
        return {"ok": bool(out.get("ok")), "latencyMs": round((time.monotonic() - started) * 1000), "detail": "Model responded"}
    except LLMError as exc:
        return {"ok": False, "latencyMs": round((time.monotonic() - started) * 1000), "detail": str(exc)}
