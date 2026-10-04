from .conftest import as_role

HR = "uc-peopledesk-assistant"
SEC = as_role("Security analyst")


def gate(client, app_id=HR):
    return client.get(f"/api/applications/{app_id}/gate").json()


def close(client, fid, headers=SEC):
    """Walk a finding through the lifecycle to Closed, adding a regression test."""
    order = ["New", "Triaged", "In fix", "Retest pending", "Closed"]
    current = client.get(f"/api/findings/{fid}", headers=headers).json()["status"]
    for to in order[order.index(current) + 1:]:
        body = {"to": to, "regressionTitle": f"{fid} stays fixed"} if to == "Closed" else {"to": to}
        r = client.post(f"/api/findings/{fid}/transitions", json=body, headers=headers)
        assert r.status_code == 200, r.text
    return r.json()


def test_state_snapshot_has_everything(client):
    s = client.get("/api/state", headers=SEC).json()
    assert len(s["applications"]) == 6 and len(s["scans"]) == 7 and len(s["findings"]) == 11
    assert s["sessions"], "security analysts see manual sessions"
    assert {"passed", "criteria", "failed", "evaluated"} <= set(s["applications"][0]["gate"])


def test_seed_gate_matches_sample_story(client):
    g = gate(client)
    assert not g["passed"]
    failed = {c["name"] for c in g["failed"]}
    assert {"Highest category rate", "Scenario attacks defended", "Canary leaks", "Open critical findings"} <= failed
    assert all(c["status"] != "Fail" for c in g["criteria"] if c["group"] == "Evaluation")


def test_cannot_close_without_regression_test(client):
    fid = "FND-0219"  # Retest pending
    r = client.post(f"/api/findings/{fid}/transitions", json={"to": "Closed"}, headers=SEC)
    assert r.status_code == 422
    f = close(client, fid)
    assert f["status"] == "Closed" and f["regressionTestId"].startswith("REG-")
    tests = client.get("/api/regression-tests").json()
    assert any(t["findingId"] == fid for t in tests)


def test_lifecycle_rules_and_roles(client):
    # Product team cannot triage; skipping states is refused
    r = client.post("/api/findings/FND-0232/transitions", json={"to": "Triaged"}, headers=as_role("Product team member"))
    assert r.status_code == 409 and "Security" in r.json()["detail"]
    r = client.post("/api/findings/FND-0232/transitions", json={"to": "In fix"}, headers=SEC)
    assert r.status_code == 409
    # Triage assigns the app owner; In fix links a work item
    f = client.post("/api/findings/FND-0232/transitions", json={"to": "Triaged"}, headers=SEC).json()
    assert f["owner"] == "People Tech"
    f = client.post("/api/findings/FND-0232/transitions", json={"to": "In fix"}, headers=SEC).json()
    assert f["workItem"]
    # Only governance accepts risk, and needs controls
    r = client.post("/api/findings/FND-0228/transitions", json={"to": "Accepted risk"}, headers=SEC)
    assert r.status_code == 409
    gov = as_role("Governance board member")
    r = client.post("/api/findings/FND-0228/transitions", json={"to": "Accepted risk"}, headers=gov)
    assert r.status_code == 422
    r = client.post("/api/findings/FND-0228/transitions", json={"to": "Accepted risk", "acceptance": {"expires": "2027-01-01T00:00:00Z", "controls": "Display only"}}, headers=gov)
    assert r.json()["status"] == "Accepted risk"
    # Auditor is read-only
    assert client.post("/api/findings/FND-0240/transitions", json={"to": "Triaged"}, headers=as_role("Auditor")).status_code == 403


def test_severity_change_recomputes_deadline(client):
    before = client.get("/api/findings/FND-0232", headers=SEC).json()
    after = client.patch("/api/findings/FND-0232", json={"severity": "High"}, headers=SEC).json()
    assert after["dueAt"] < before["dueAt"]
    assert client.patch("/api/findings/FND-0232", json={"severity": "Low"}, headers=as_role("Product owner")).status_code == 403


def test_full_loop_fix_rescan_gate_signoff(client):
    for fid in ("FND-0231", "FND-0232", "FND-0219"):
        close(client, fid)
    scan = client.post("/api/scans", json={"appId": HR, "mode": "Release", "complexities": ["Easy", "Moderate", "Difficult"],
                                           "strategies": ["Baseline", "Encoding", "Jailbreak", "Indirect", "Multi-turn"]}, headers=SEC)
    assert scan.status_code == 202
    done = client.get(f"/api/scans/{scan.json()['id']}").json()
    assert done["status"] == "Completed" and done["canaryLeaks"] == 0
    g = gate(client)
    assert g["passed"], g["failed"]

    run = client.post(f"/api/applications/{HR}/gate-runs", headers=SEC).json()
    assert run["run"]["result"] == "Passed"
    # Product owner cannot sign off a high-risk release; the two required roles can
    assert client.post(f"/api/applications/{HR}/sign-offs", headers=as_role("Product owner")).status_code == 403
    for role in ("Security analyst", "Governance board member"):
        assert client.post(f"/api/applications/{HR}/sign-offs", headers=as_role(role)).status_code == 201
    pack = client.get(f"/api/applications/{HR}/evidence-pack").json()
    assert len(pack["approvals"]["recorded"]) == 2 and pack["gate"]["passed"]


def test_signoff_refused_while_gate_blocked(client):
    assert client.post(f"/api/applications/{HR}/sign-offs", headers=SEC).status_code == 409


def test_scan_validation_and_auto_findings(client):
    # Agent-only categories are refused for RAG apps
    r = client.post("/api/scans", json={"appId": HR, "complexities": ["Easy"], "strategies": ["Baseline"], "categories": ["Prohibited actions"]}, headers=SEC)
    assert r.status_code == 422
    assert client.post("/api/scans", json={"appId": HR, "complexities": ["Easy"], "strategies": ["Baseline"]}, headers=as_role("Auditor")).status_code == 403
    # Vendor MCP server has a category over limit with no open finding for it -> scan logs one
    before = len(client.get("/api/findings?app=uc-vendorhub-mcp").json())
    client.post("/api/scans", json={"appId": "uc-vendorhub-mcp", "mode": "Developer", "complexities": ["Easy"], "strategies": ["Baseline", "Encoding", "Indirect"]}, headers=SEC)
    after = client.get("/api/findings?app=uc-vendorhub-mcp").json()
    assert len(after) >= before


def test_thresholds_editing(client):
    assert client.patch("/api/thresholds/High", json={"maxAsrOverall": 3}, headers=as_role("Product owner")).status_code == 403
    r = client.patch("/api/thresholds/High", json={"maxAsrOverall": 3}, headers=as_role("AI platform engineer"))
    assert r.status_code == 200 and r.json()["maxAsrOverall"] == 3
    assert client.patch("/api/thresholds/High", json={"canaryLeaks": 5}, headers=as_role("AI platform engineer")).status_code == 422


def test_restricted_content_hidden_from_product_team(client):
    pt = as_role("Product team member")
    lib = client.get("/api/library", headers=pt).json()
    restricted = [i for i in lib if i["restricted"]]
    assert restricted and all(i["path"] == "restricted://…" and i["items"] is None for i in restricted)
    f = client.get("/api/findings/FND-0231", headers=pt).json()
    assert ";" not in f["evidence"]
    assert client.get("/api/sessions", headers=pt).status_code == 403
    assert client.get("/api/state", headers=pt).json()["sessions"] == []


def test_manual_session_rules(client):
    # Planned session requires an authorization for the same app
    r = client.post("/api/sessions", json={"appId": HR, "authorizationId": "AUTH-031", "objectives": ["x"]}, headers=SEC)
    assert r.status_code == 409
    s = client.post("/api/sessions", json={"appId": HR, "authorizationId": "AUTH-027", "objectives": ["Cross-user leakage"]}, headers=SEC).json()
    # AUTH-027 expired in the seed data
    assert client.post(f"/api/sessions/{s['id']}/status", json={"status": "Active"}, headers=SEC).status_code == 409

    active = "EX-015"
    a = client.post(f"/api/sessions/{active}/attempts", json={"category": "Prohibited actions", "technique": "Forged approval", "entry": "Peer agent", "outcome": "Succeeded", "note": "Approval skipped"}, headers=SEC)
    assert a.status_code == 201
    opted_out = client.post(f"/api/sessions/{active}/attempts", json={"category": "Self-harm", "technique": "x", "entry": "User", "outcome": "Defended"}, headers=SEC)
    assert opted_out.status_code == 409
    f = client.post(f"/api/sessions/{active}/attempts/{a.json()['id']}/finding", json={"title": "Forged approval accepted", "severity": "High", "category": "Prohibited actions"}, headers=SEC).json()
    assert f["source"] == "Manual exercise"
    done = client.post(f"/api/sessions/{active}/status", json={"status": "Completed"}, headers=SEC).json()
    assert done["attempts"][-1]["findingId"] == f["id"]
    runs = client.get("/api/runs?kind=Manual exercise").json()
    assert runs[0]["ref"] == active


def test_register_application(client):
    body = {"name": "Contract Review Agent", "type": "Agent", "tier": "High", "owner": "Legal Tech", "entryPoints": ["User", "Document"]}
    r = client.post("/api/applications", json=body, headers=as_role("Product owner"))
    assert r.status_code == 201 and r.json()["id"] == "uc-contract-review-agent"
    assert not r.json()["gate"]["passed"]
    assert client.post("/api/applications", json=body, headers=as_role("Product owner")).status_code == 409
    assert client.post("/api/applications", json=body, headers=as_role("Auditor")).status_code == 403
