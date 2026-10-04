"""Loads sample data from seed_data.json. Dates in the fixture are "@rel:<days>:<hour>" relative to today."""

import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from . import models as m
from .db import Base, engine
from .framework import PROFILES
from .util import days_from_now

_REL = re.compile(r"^@rel:(-?\d+):(\d+)$")
_FIXTURE = Path(__file__).with_name("seed_data.json")


def _decode(v: Any) -> Any:
    if isinstance(v, str) and (hit := _REL.match(v)):
        return days_from_now(int(hit[1]), int(hit[2]))
    if isinstance(v, list):
        return [_decode(x) for x in v]
    if isinstance(v, dict):
        return {k: _decode(x) for k, x in v.items()}
    return v


def _snake(d: dict[str, Any], rename: dict[str, str] | None = None) -> dict[str, Any]:
    out = {}
    for k, v in d.items():
        k = (rename or {}).get(k, k)
        out[re.sub(r"([A-Z])", r"_\1", k).lower()] = v
    return out


def load_sample_data(db: Session) -> None:
    data = _decode(json.loads(_FIXTURE.read_text()))
    db.add_all(m.Application(**_snake(a)) for a in data["applications"])
    db.add_all(m.RedTeamScan(**_snake(s)) for s in data["scans"])
    db.add_all(m.Finding(**_snake(f)) for f in data["findings"])
    db.add_all(m.LibraryItem(**_snake(i)) for i in data["library"])
    db.add_all(m.RegressionTest(**_snake(r)) for r in data["regressionTests"])
    db.add_all(m.RunRecord(**_snake(r)) for r in data["runs"])
    db.add_all(m.ManualSession(**_snake(s)) for s in data["sessions"])
    db.add_all(m.Authorization(**_snake(a, {"from": "from_"})) for a in data["authorizations"])
    db.add_all(m.GateThresholdSet(tier=t, data=v) for t, v in data["thresholds"].items())
    db.add(m.Counter(name="seq", value=data["seq"]))
    _sample_models_and_evaluations(db, data)
    db.commit()


def _model(id_, name, purpose, provider, default=False, **kw):
    return m.ModelDeployment(id=id_, name=name, purpose=purpose, provider=provider, is_default=default, enabled=True,
                             dedicated=kw.pop("dedicated", True), auth=kw.pop("auth", "api-key"), notes=kw.pop("notes", ""),
                             updated_at=days_from_now(-30), **kw)


def _cal(agreement, n, days_ago):
    return {"agreement": agreement, "sampleSize": n, "calibratedAt": days_from_now(-days_ago)}


SAMPLE_MODELS = lambda: [  # noqa: E731
    # Judges (section 10.2: dedicated, version-pinned deployments never shared with production)
    _model("judge-simulated", "Simulated judge", "judge", "simulated", default=True,
           notes="Local use: reuses the release's last scores with small variation. Makes no model calls."),
    _model("judge-gpt-41", "GPT-4.1 judge", "judge", "azure-openai", endpoint="https://assurance-judge.openai.azure.com",
           deployment="judge-gpt-4.1", model_version="2025-04-14", api_version="2024-10-21", api_key_env="AZURE_OPENAI_JUDGE_KEY",
           temperature=0.0, calibration=_cal(0.88, 240, 30), notes="Primary judge for RAG and agent profiles."),
    _model("judge-gpt-4o", "GPT-4o judge", "judge", "azure-openai", endpoint="https://assurance-judge.openai.azure.com",
           deployment="judge-gpt-4o", model_version="2024-11-20", api_version="2024-10-21", api_key_env="AZURE_OPENAI_JUDGE_KEY",
           temperature=0.0, calibration=_cal(0.83, 180, 130), notes="Previous primary judge; quarterly calibration overdue."),
    _model("judge-claude-opus-5-5", "Claude Opus 5.5 judge", "judge", "anthropic", deployment="claude-opus-5-5",
           api_key_env="ANTHROPIC_API_KEY", effort="medium", calibration=_cal(0.9, 240, 12),
           notes="Second-opinion judge from a different model family, used to cross-check disagreements."),
    # Attack engines
    _model("attack-simulated", "Simulated red team engine", "attack", "simulated", default=True,
           notes="Local use: replays the last scan with fixed categories improving. Makes no model calls."),
    _model("attack-azure-eus", "Azure AI Red Teaming Agent (East US)", "attack", "azure-redteam-service",
           endpoint="https://assurance-redteam-eus.services.ai.azure.com/api/projects/redteam", model_version="SDK 1.18", auth="entra",
           notes="Hosted adversarial model and scoring in a dedicated Foundry project."),
    _model("attack-azure-weu", "Azure AI Red Teaming Agent (West Europe)", "attack", "azure-redteam-service",
           endpoint="https://assurance-redteam-weu.services.ai.azure.com/api/projects/redteam", model_version="SDK 1.18", auth="entra",
           notes="EU data residency: use for applications processing EU personal data."),
]

# Which judge scored each sample release (Insight Copilot was scored by the judge now due for calibration)
SAMPLE_JUDGE = {
    "uc-peopledesk-assistant": "judge-gpt-41", "uc-ledgerlens-agent": "judge-gpt-41", "uc-onboard-guide": "judge-gpt-41",
    "uc-comms-composer": "judge-claude-opus-5-5", "uc-insight-copilot": "judge-gpt-4o",
}


def _sample_models_and_evaluations(db: Session, data: dict[str, Any]) -> None:
    models = {x.id: x for x in SAMPLE_MODELS()}
    db.add_all(models.values())
    db.add(m.LibraryItem(id="LIB-014", app_id="uc-comms-composer", kind="Golden dataset", name="Announcement drafting set", version=3, items=80,
                         updated_at=days_from_now(-25), restricted=False, coverage="Tone, length, policy wording", path="datasets/uc-comms-composer/v3.jsonl"))
    db.flush()
    for scan in db.query(m.RedTeamScan):
        scan.attack_model_id, scan.attack_model = "attack-azure-eus", "Azure AI Red Teaming Agent (East US) (SDK 1.18)"
    for n, app in enumerate(db.query(m.Application).order_by(m.Application.id), start=1):
        judge = models.get(SAMPLE_JUDGE.get(app.id, "judge-simulated"))
        dataset = (db.query(m.LibraryItem).filter(m.LibraryItem.app_id == app.id, m.LibraryItem.kind.in_(("Golden dataset", "Agent scenarios")))
                   .order_by(m.LibraryItem.version.desc()).first())
        defs = {d["name"]: d for d in PROFILES[app.profile]["metrics"]}
        run = m.EvaluationRun(
            id=f"EV-{200 + n:04d}", app_id=app.id, version=app.release["version"], mode="Pre-release", status="Completed", progress=100,
            started_at=app.release["date"], finished_at=app.release["date"], judge_model_id=judge.id,
            judge={"id": judge.id, "name": judge.name, "provider": judge.provider, "deployment": judge.deployment, "modelVersion": judge.model_version},
            dataset_id=dataset.id if dataset else None, dataset=dataset.path if dataset else "—", profile=app.profile,
            cases=dataset.items if dataset else 0,
            metrics=[{**mt, "key": defs.get(mt["name"], {}).get("key", ""), "kind": defs.get(mt["name"], {}).get("kind", "judge")} for mt in app.release["metrics"]],
            content_safety_defect_pct=app.release.get("contentSafetyDefectPct"), pass_k=app.release.get("passK"),
            case_results=[], judge_calls=(dataset.items if dataset else 0) * 4,
        )
        db.add(run)
        app.release = {**app.release, "evaluationRunId": run.id, "judgeModelId": judge.id}


def init_db(seed: bool) -> None:
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        if seed and db.query(m.Application).count() == 0:
            load_sample_data(db)


def reset_db() -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        load_sample_data(db)
