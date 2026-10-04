import json

import anthropic
import httpx
import httpx2
import pytest

from app.llm import client as llm_client
from app.models import ModelDeployment
from app.services import evaluations

from .conftest import as_role

PE = as_role("AI platform engineer")
SEC = as_role("Security analyst")
PD = "uc-peopledesk-assistant"


@pytest.fixture()
def inline_evals(monkeypatch):
    monkeypatch.setattr(evaluations, "launch", lambda run_id, background=True: evaluations.run_evaluation(run_id))


# ---------- Model registry ----------

def test_registry_lists_judges_and_attack_engines(client):
    models = client.get("/api/models").json()
    judges = [m for m in models if m["purpose"] == "judge"]
    attacks = [m for m in models if m["purpose"] == "attack"]
    assert len(judges) >= 4 and len(attacks) >= 3
    assert sum(m["isDefault"] for m in judges) == 1 and sum(m["isDefault"] for m in attacks) == 1
    assert all("apiKey" not in m for m in models), "secrets are never returned"
    gpt = next(m for m in models if m["id"] == "judge-gpt-41")
    assert gpt["apiKeyEnv"] == "AZURE_OPENAI_JUDGE_KEY" and gpt["secretConfigured"] is False


def test_register_validate_and_manage_models(client):
    body = {"name": "Llama 3.3 judge", "purpose": "judge", "provider": "openai-compatible", "endpoint": "https://llm.internal/v1", "deployment": "llama-3.3-70b", "apiKeyEnv": "LLAMA_KEY"}
    assert client.post("/api/models", json=body, headers=SEC).status_code == 403
    r = client.post("/api/models", json=body, headers=PE)
    assert r.status_code == 201 and r.json()["id"] == "judge-llama-3-3-judge" and not r.json()["isDefault"]

    # Provider rules
    bad = client.post("/api/models", json={"name": "Claude judge 2", "purpose": "judge", "provider": "anthropic", "deployment": "claude-opus-5-5", "apiKeyEnv": "ANTHROPIC_API_KEY", "temperature": 0}, headers=PE)
    assert bad.status_code == 422 and "temperature" in bad.json()["detail"]
    assert client.post("/api/models", json={"name": "No key", "purpose": "judge", "provider": "azure-openai", "endpoint": "https://x", "deployment": "d"}, headers=PE).status_code == 422
    assert client.post("/api/models", json={"name": "GPT attacker", "purpose": "attack", "provider": "azure-openai", "endpoint": "https://x", "deployment": "d", "apiKeyEnv": "K"}, headers=PE).status_code == 422
    assert client.post("/api/models", json={"name": "Bad env", "purpose": "judge", "provider": "openai-compatible", "endpoint": "https://x", "deployment": "d", "apiKeyEnv": "lower-case"}, headers=PE).status_code == 422

    # Default switching, disable rules, calibration
    mid = r.json()["id"]
    assert client.post(f"/api/models/{mid}/default", headers=PE).json()["isDefault"]
    assert not next(m for m in client.get("/api/models").json() if m["id"] == "judge-simulated")["isDefault"]
    assert client.patch(f"/api/models/{mid}", json={"enabled": False}, headers=PE).status_code == 409
    cal = client.patch(f"/api/models/{mid}", json={"calibration": {"agreement": 0.86, "sampleSize": 150, "calibratedAt": "2026-10-01T00:00:00Z"}}, headers=PE).json()
    assert cal["calibration"] == {"agreement": 0.86, "sampleSize": 150, "calibratedAt": "2026-10-01T00:00:00Z"}

    # Models with recorded runs cannot be deleted (provenance)
    assert client.delete("/api/models/judge-gpt-41", headers=PE).status_code == 409


def test_connection_test_reports_missing_secret(client, monkeypatch):
    monkeypatch.delenv("AZURE_OPENAI_JUDGE_KEY", raising=False)
    r = client.post("/api/models/judge-gpt-41/test", headers=PE).json()
    assert r["ok"] is False and "AZURE_OPENAI_JUDGE_KEY" in r["detail"]
    assert client.post("/api/models/judge-simulated/test", headers=PE).json()["ok"] is True


# ---------- Evaluations ----------

def test_simulated_evaluation_becomes_release_of_record(client, inline_evals):
    r = client.post("/api/evaluations", json={"appId": PD}, headers=SEC)
    assert r.status_code == 202
    run = client.get(f"/api/evaluations/{r.json()['id']}").json()
    assert run["status"] == "Completed" and run["judgeModelId"] == "judge-simulated"
    app = client.get(f"/api/applications/{PD}").json()
    assert app["release"]["evaluationRunId"] == run["id"] and app["release"]["judgeModelId"] == "judge-simulated"
    assert [m["name"] for m in app["release"]["metrics"]] == [m["name"] for m in run["metrics"]]
    assert not any(c["name"] == "Judge calibration" for c in app["gate"]["criteria"])


def test_stale_judge_calibration_is_advisory(client):
    gate = client.get("/api/applications/uc-insight-copilot/gate").json()
    cal = next(c for c in gate["criteria"] if c["name"] == "Judge calibration")
    assert cal["status"] == "Warn" and "GPT-4o judge" in cal["reason"]
    assert gate["passed"], "calibration is advisory, not blocking"


def test_evaluation_with_missing_key_fails_clearly(client, inline_evals, monkeypatch):
    monkeypatch.delenv("AZURE_OPENAI_JUDGE_KEY", raising=False)
    r = client.post("/api/evaluations", json={"appId": PD, "judgeModelId": "judge-gpt-41"}, headers=SEC)
    run = client.get(f"/api/evaluations/{r.json()['id']}").json()
    assert run["status"] == "Failed" and "AZURE_OPENAI_JUDGE_KEY" in run["error"]
    # The release keeps its previous evaluation of record
    assert client.get(f"/api/applications/{PD}").json()["release"]["evaluationRunId"] != run["id"]


def test_evaluation_rejects_wrong_model_kind(client):
    r = client.post("/api/evaluations", json={"appId": PD, "judgeModelId": "attack-simulated"}, headers=SEC)
    assert r.status_code == 422
    assert client.post("/api/evaluations", json={"appId": PD}, headers=as_role("Auditor")).status_code == 403


def _azure_mock(requests: list):
    """Azure OpenAI chat completions: likert rubrics score 4, binary rubrics pass except content safety on PD-004."""
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append((request, body))
        prompt = body["messages"][-1]["content"]
        if '"pass"' in body["messages"][0]["content"]:  # binary rubric
            flagged = "no hateful" in prompt and "60 EUR" in prompt  # content safety rubric on case PD-004
            verdict = {"pass": not flagged, "reason": "ok"}
        else:
            verdict = {"score": 4, "reason": "mostly supported"}
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(verdict)}}]})
    return handler


def test_real_judge_path_with_azure_openai(client, inline_evals, monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_JUDGE_KEY", "test-key")
    calls: list = []
    real = httpx.Client
    monkeypatch.setattr(llm_client.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(_azure_mock(calls)), **kw))

    r = client.post("/api/evaluations", json={"appId": PD, "judgeModelId": "judge-gpt-41"}, headers=SEC)
    run = client.get(f"/api/evaluations/{r.json()['id']}").json()
    assert run["status"] == "Completed", run.get("error")
    assert run["cases"] == 6 and run["judgeCalls"] == len(calls)

    req, body = calls[0]
    assert req.url.path == "/openai/deployments/judge-gpt-4.1/chat/completions"
    assert req.url.params["api-version"] == "2024-10-21" and req.headers["api-key"] == "test-key"
    assert body["temperature"] == 0.0 and body["response_format"] == {"type": "json_object"}

    m = {x["name"]: x["value"] for x in run["metrics"]}
    assert m["Groundedness"] == 4.0 and m["Relevance"] == 4.0
    assert m["Key fact coverage"] == 1.0  # every fact appears in the recorded responses
    assert m["Retrieval recall at 5"] == 1.0
    assert m["Unanswerable handling defects"] == 0.0
    assert run["contentSafetyDefectPct"] == pytest.approx(16.7, abs=0.1)  # 1 of 6 flagged by the mock
    assert len(run["caseResults"]) == 6 and "groundedness" in run["caseResults"][0]["scores"]

    gate = client.get(f"/api/applications/{PD}/gate").json()
    assert any(c["name"] == "Groundedness" and c["status"] == "Fail" for c in gate["criteria"]), "4.0 is below the 4.2 limit"
    assert any(c["name"] == "Content safety defects" and c["status"] == "Fail" for c in gate["criteria"])


def test_anthropic_judge_request_shape_and_refusal(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        seen["beta"] = request.headers.get("anthropic-beta")
        refuse = "REFUSE" in seen["body"]["messages"][0]["content"]
        return httpx2.Response(200, json={
            "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
            "content": [] if refuse else [{"type": "text", "text": '{"score": 5, "reason": "fully grounded"}'}],
            "stop_reason": "refusal" if refuse else "end_turn", "stop_sequence": None,
            "stop_details": {"type": "refusal", "category": None, "explanation": None} if refuse else None,
            "usage": {"input_tokens": 10, "output_tokens": 5},
        })

    model = ModelDeployment(id="j", name="Claude judge", purpose="judge", provider="anthropic", deployment="claude-opus-5-5",
                            api_key_env="ANTHROPIC_API_KEY", effort="medium", auth="api-key")
    http = anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler))
    from app.llm.judge import judge
    v = judge(model, "groundedness", {"query": "q", "response": "r", "context": "c"}, http=http)
    assert v.value == 5.0
    b = seen["body"]
    assert b["model"] == "claude-opus-5-5" and "temperature" not in b and "thinking" not in b
    assert b["output_config"]["effort"] == "medium" and b["output_config"]["format"]["type"] == "json_schema"
    assert b["fallbacks"] == "default" and "server-side-fallback-2026-07-01" in seen["beta"]

    with pytest.raises(llm_client.LLMRefusal):
        llm_client.complete_json(model, "s", "REFUSE", {"type": "object"}, http=http)


# ---------- Attack engine selection ----------

def test_scan_records_selected_attack_engine(client):
    body = {"appId": PD, "complexities": ["Easy"], "strategies": ["Baseline"], "mode": "Developer"}
    scan = client.post("/api/scans", json={**body, "attackModelId": "attack-simulated"}, headers=SEC).json()
    done = client.get(f"/api/scans/{scan['id']}").json()
    assert done["status"] == "Completed" and done["attackModelId"] == "attack-simulated"
    assert client.post("/api/scans", json={**body, "attackModelId": "judge-gpt-41"}, headers=SEC).status_code == 422


def test_azure_engine_without_sdk_fails_cleanly(client):
    pytest.importorskip("app")  # always present; the Azure SDK is deliberately not installed in dev
    try:
        import azure.ai.evaluation.red_team  # noqa: F401
        pytest.skip("Azure SDK installed; this test covers the not-installed case")
    except ImportError:
        pass
    scan = client.post("/api/scans", json={"appId": PD, "attackModelId": "attack-azure-eus", "complexities": ["Easy"], "strategies": ["Baseline"], "mode": "Developer"}, headers=SEC).json()
    done = client.get(f"/api/scans/{scan['id']}").json()
    assert done["status"] == "Failed" and done["error"]
