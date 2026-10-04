"""Request bodies. Responses use the camelCase shapes from serialize.py."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Tier = Literal["Low", "Medium", "High"]
AppType = Literal["RAG assistant", "Chat tool", "Agent", "Multi-agent", "MCP server"]
EntryPoint = Literal["User", "Document", "Tool output", "MCP response", "Peer agent", "Upload"]
Complexity = Literal["Easy", "Moderate", "Difficult"]
Strategy = Literal["Baseline", "Encoding", "Jailbreak", "Indirect", "Multi-turn"]
Severity = Literal["Critical", "High", "Medium", "Low"]
FindingStatus = Literal["New", "Triaged", "In fix", "Retest pending", "Closed", "Accepted risk"]
FindingSource = Literal["Automated scan", "Scenario", "Manual exercise", "Production monitoring"]


class In(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class ApplicationCreate(In):
    name: str = Field(min_length=2, max_length=200)
    type: AppType
    tier: Tier
    owner: str = Field(min_length=1)
    ec_member: str = ""
    description: str = ""
    entry_points: list[EntryPoint] = ["User"]
    threats: list[str] = []


class ScanCreate(In):
    app_id: str
    attack_model_id: str | None = None  # default attack model when omitted
    mode: Literal["Release", "Developer", "Scheduled"] = "Release"
    complexities: list[Complexity] = Field(min_length=1)
    strategies: list[Strategy] = Field(min_length=1)
    categories: list[str] = []


class FindingCreate(In):
    app_id: str
    title: str = Field(min_length=3)
    severity: Severity
    category: str
    owasp: list[str] = []
    source: FindingSource
    source_ref: str = "—"
    evidence: str = "See restricted storage"


class FindingUpdate(In):
    owner: str | None = None
    severity: Severity | None = None
    work_item: str | None = None


class Acceptance(In):
    expires: str
    controls: str = Field(min_length=1)


class Transition(In):
    to: FindingStatus
    regression_title: str | None = None
    acceptance: Acceptance | None = None
    note: str | None = None


class ThresholdPatch(In):
    max_asr_overall: float | None = Field(default=None, ge=0, le=100)
    max_asr_category: float | None = Field(default=None, ge=0, le=100)
    complexity: list[Complexity] | None = None
    scenarios: Literal["Not required", "Critical defended", "All defended"] | None = None


class SessionCreate(In):
    app_id: str
    authorization_id: str
    objectives: list[str] = Field(min_length=1)
    opt_outs: list[str] = []
    title: str | None = None


class AttemptCreate(In):
    category: str
    technique: str = Field(min_length=1)
    entry: EntryPoint
    outcome: Literal["Defended", "Partial", "Succeeded"]
    note: str = ""


class SessionStatus(In):
    status: Literal["Planned", "Active", "Completed"]


class AttemptFinding(In):
    title: str = Field(min_length=3)
    severity: Severity
    category: str
    owasp: list[str] = []
    evidence: str = ""


Provider = Literal["simulated", "azure-openai", "openai-compatible", "anthropic", "azure-redteam-service"]
Effort = Literal["low", "medium", "high", "xhigh", "max"]


class Calibration(In):
    agreement: float = Field(ge=0, le=1)  # judge-human agreement on a labelled sample
    sample_size: int = Field(ge=1)
    calibrated_at: str


class ModelFields(In):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    endpoint: str | None = None
    deployment: str | None = None
    model_version: str | None = None
    api_version: str | None = None
    auth: Literal["api-key", "entra"] | None = None
    api_key_env: str | None = Field(default=None, pattern=r"^[A-Z_][A-Z0-9_]*$")
    effort: Effort | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    dedicated: bool | None = None
    enabled: bool | None = None
    notes: str | None = None
    calibration: Calibration | None = None


class ModelCreate(ModelFields):
    name: str = Field(min_length=2, max_length=120)
    purpose: Literal["judge", "attack"]
    provider: Provider


class EvaluationCreate(In):
    app_id: str
    judge_model_id: str | None = None  # default judge when omitted
    dataset_id: str | None = None  # the app's latest golden dataset when omitted
    mode: Literal["Pre-release", "Online"] = "Pre-release"
