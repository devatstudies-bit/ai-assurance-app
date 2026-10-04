"""ORM tables. Names follow section 10.3 of the framework (RedTeamScan, Finding, ThreatModel, ...).

Nested structures that are always read and written whole (release metrics, heat map rows,
scenario results, history) are stored as JSON in the camelCase shape the API returns.
Timestamps are ISO-8601 UTC strings.
"""

from typing import Any

from sqlalchemy import JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(40))
    tier: Mapped[str] = mapped_column(String(10))
    stage: Mapped[str] = mapped_column(String(20))
    owner: Mapped[str] = mapped_column(String(120))
    ec_member: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    profile: Mapped[str] = mapped_column(String(80))
    sandbox: Mapped[str] = mapped_column(String(200))
    quality_index: Mapped[int] = mapped_column(Integer, default=0)
    threat_model: Mapped[dict[str, Any]] = mapped_column(JSON)
    release: Mapped[dict[str, Any]] = mapped_column(JSON)
    last_manual_test: Mapped[str | None] = mapped_column(String(32), nullable=True)
    next_manual_test: Mapped[str | None] = mapped_column(String(32), nullable=True)
    next_scheduled_scan: Mapped[str] = mapped_column(String(32))
    asr_history: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class RedTeamScan(Base):
    __tablename__ = "red_team_scans"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(80), index=True)
    version: Mapped[str] = mapped_column(String(20))
    mode: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    progress: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[str] = mapped_column(String(32))
    duration_min: Mapped[int] = mapped_column(Integer, default=0)
    complexities: Mapped[list[str]] = mapped_column(JSON)
    strategies: Mapped[list[str]] = mapped_column(JSON)
    categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    attack_model: Mapped[str] = mapped_column(String(120))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    successes: Mapped[int] = mapped_column(Integer, default=0)
    heat: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    by_complexity: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    scenarios: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    canary_leaks: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attack_model_id: Mapped[str | None] = mapped_column(String(60), nullable=True)


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(40))
    source_ref: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(80))
    owasp: Mapped[list[str]] = mapped_column(JSON, default=list)
    owner: Mapped[str] = mapped_column(String(120))
    opened_at: Mapped[str] = mapped_column(String(32))
    due_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    closed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    regression_test_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    work_item: Mapped[str | None] = mapped_column(String(60), nullable=True)
    found_in: Mapped[str] = mapped_column(String(20))
    evidence: Mapped[str] = mapped_column(Text)
    acceptance: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    history: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class LibraryItem(Base):
    __tablename__ = "library_items"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(200))
    version: Mapped[int] = mapped_column(Integer)
    items: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[str] = mapped_column(String(32))
    restricted: Mapped[bool] = mapped_column(default=False)
    coverage: Mapped[str] = mapped_column(String(200))
    path: Mapped[str] = mapped_column(String(300))


class RegressionTest(Base):
    __tablename__ = "regression_tests"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(80))
    finding_id: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(Text)
    added_at: Mapped[str] = mapped_column(String(32))


class RunRecord(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(80), index=True)
    at: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(30))
    version: Mapped[str] = mapped_column(String(20))
    detail: Mapped[str] = mapped_column(Text)
    result: Mapped[str] = mapped_column(String(20))
    ref: Mapped[str | None] = mapped_column(String(20), nullable=True)


class Authorization(Base):
    __tablename__ = "authorizations"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(80))
    environment: Mapped[str] = mapped_column(String(20))
    from_: Mapped[str] = mapped_column("from", String(32))
    to: Mapped[str] = mapped_column(String(32))
    testers: Mapped[list[str]] = mapped_column(JSON)
    approved_by: Mapped[str] = mapped_column(String(200))


class ManualSession(Base):
    __tablename__ = "manual_sessions"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(80))
    authorization_id: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20))
    start: Mapped[str] = mapped_column(String(32))
    end: Mapped[str] = mapped_column(String(32))
    testers: Mapped[list[str]] = mapped_column(JSON)
    objectives: Mapped[list[str]] = mapped_column(JSON)
    opt_outs: Mapped[list[str]] = mapped_column(JSON, default=list)
    attempts: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class GateThresholdSet(Base):
    __tablename__ = "gate_thresholds"
    tier: Mapped[str] = mapped_column(String(10), primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)


class Counter(Base):
    __tablename__ = "counters"
    name: Mapped[str] = mapped_column(String(20), primary_key=True)
    value: Mapped[int] = mapped_column(Integer)


class ModelDeployment(Base):
    """A judge or attack LLM (section 10.2: dedicated, version-pinned deployments never shared with production).

    Secrets are never stored: `api_key_env` names the environment variable (or Key Vault-backed setting) that holds the key.
    """

    __tablename__ = "model_deployments"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    purpose: Mapped[str] = mapped_column(String(10))  # judge | attack
    # judge: simulated | azure-openai | openai-compatible | anthropic; attack: simulated | azure-redteam-service
    provider: Mapped[str] = mapped_column(String(30))
    endpoint: Mapped[str | None] = mapped_column(String(300), nullable=True)  # for azure-redteam-service: the Foundry project endpoint
    deployment: Mapped[str | None] = mapped_column(String(120), nullable=True)  # deployment name or model id
    model_version: Mapped[str | None] = mapped_column(String(60), nullable=True)
    api_version: Mapped[str | None] = mapped_column(String(30), nullable=True)
    auth: Mapped[str] = mapped_column(String(20), default="api-key")  # api-key | entra
    api_key_env: Mapped[str | None] = mapped_column(String(80), nullable=True)
    effort: Mapped[str | None] = mapped_column(String(10), nullable=True)  # Claude effort level
    temperature: Mapped[float | None] = mapped_column(nullable=True)  # omitted when null
    dedicated: Mapped[bool] = mapped_column(default=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    is_default: Mapped[bool] = mapped_column(default=False)
    calibration: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)  # {agreement, sampleSize, calibratedAt}
    notes: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[str] = mapped_column(String(32))


class EvaluationRun(Base):
    """One evaluation of a release against its golden dataset, scored by a selected judge model."""

    __tablename__ = "evaluation_runs"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(80), index=True)
    version: Mapped[str] = mapped_column(String(20))
    mode: Mapped[str] = mapped_column(String(20))  # Pre-release | Online
    status: Mapped[str] = mapped_column(String(20))
    progress: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[str] = mapped_column(String(32))
    finished_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    judge_model_id: Mapped[str] = mapped_column(String(60))
    judge: Mapped[dict[str, Any]] = mapped_column(JSON)  # snapshot of the judge config used, for provenance
    dataset_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dataset: Mapped[str] = mapped_column(String(300))
    profile: Mapped[str] = mapped_column(String(80))
    cases: Mapped[int] = mapped_column(Integer, default=0)
    metrics: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    content_safety_defect_pct: Mapped[float | None] = mapped_column(nullable=True)
    pass_k: Mapped[float | None] = mapped_column(nullable=True)
    case_results: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    judge_calls: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
