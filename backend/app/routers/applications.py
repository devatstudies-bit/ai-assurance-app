import re

from fastapi import APIRouter, HTTPException, status

from ..framework import PROFILE_BY_TYPE, Perm, can_sign_off
from ..models import Application, EvaluationRun, Finding, RedTeamScan, RegressionTest, RunRecord
from ..schemas import ApplicationCreate
from ..security import CurrentUser, require
from ..serialize import finding_out, to_api
from ..util import days_from_now, next_id, now
from .common import Db, app_out, gate_for, get_or_404, thresholds

router = APIRouter(prefix="/api/applications", tags=["Application registry"])


@router.get("")
def list_applications(db: Db):
    th = thresholds(db)
    findings = db.query(Finding).all()
    return [app_out(db, a, findings, th) for a in db.query(Application).order_by(Application.name)]


@router.get("/{app_id}")
def get_application(app_id: str, db: Db):
    return app_out(db, get_or_404(db, Application, app_id, "Application"))


@router.post("", status_code=status.HTTP_201_CREATED)
def register_application(body: ApplicationCreate, db: Db, user: CurrentUser):
    require(user, Perm.REGISTER_APPS)
    app_id = "uc-" + re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")
    if db.get(Application, app_id):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{app_id} is already registered")
    app = Application(
        id=app_id, name=body.name, type=body.type, tier=body.tier, stage="Design", owner=body.owner,
        ec_member=body.ec_member or "[EC member]", description=body.description or "No description yet.",
        profile=PROFILE_BY_TYPE[body.type], sandbox=f"sbx-{app_id[3:]}.staging.internal", quality_index=0,
        threat_model={"dataAccess": [], "actions": [], "entryPoints": body.entry_points, "threats": body.threats, "approvedBy": "Pending", "version": 1},
        release={"version": "v1", "date": now(), "pipeline": "—", "model": "TBD", "prompt": "v1", "goldenSet": "Not yet defined",
                 "metrics": [], "contentSafetyDefectPct": 0, "signOffs": []},
        next_scheduled_scan=days_from_now(7), asr_history=[],
    )
    db.add(app)
    db.commit()
    return app_out(db, app)


@router.get("/{app_id}/gate")
def get_gate(app_id: str, db: Db):
    return gate_for(db, get_or_404(db, Application, app_id, "Application"))


@router.post("/{app_id}/gate-runs", status_code=status.HTTP_201_CREATED)
def rerun_gate(app_id: str, db: Db, user: CurrentUser):
    """Re-applies the unified gate to the release candidate and records the decision. Called by pipelines."""
    require(user, Perm.RUN_GATE)
    app = get_or_404(db, Application, app_id, "Application")
    gate = gate_for(db, app)
    rel = dict(app.release)
    rel["date"] = now()
    if not gate["passed"]:
        rel["signOffs"] = []  # a blocked release cannot carry earlier sign-offs
    app.release = rel
    run = RunRecord(
        id=next_id(db, "RUN"), app_id=app.id, at=now(), kind="Release gate", version=rel["version"],
        detail=f"All {gate['evaluated']} criteria passed" if gate["passed"] else f"{len(gate['failed'])} of {gate['evaluated']} criteria failed",
        result="Passed" if gate["passed"] else "Blocked", ref=rel.get("scanId"),
    )
    db.add(run)
    db.commit()
    return {"run": to_api(run), "gate": gate}


@router.post("/{app_id}/sign-offs", status_code=status.HTTP_201_CREATED)
def sign_off(app_id: str, db: Db, user: CurrentUser):
    app = get_or_404(db, Application, app_id, "Application")
    required = thresholds(db)[app.tier]["signOff"]
    if not can_sign_off(user.role, app.tier, required):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"{user.role} cannot sign off a {app.tier.lower()}-risk release")
    if not gate_for(db, app)["passed"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "The gate must pass before sign-off")
    signs = app.release.get("signOffs", [])
    if any(s["role"] == user.role for s in signs):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already signed off as {user.role}")
    app.release = {**app.release, "signOffs": [*signs, {"role": user.role, "by": user.name, "at": now()}]}
    db.commit()
    return app_out(db, app)


@router.get("/{app_id}/evidence-pack")
def evidence_pack(app_id: str, db: Db, user: CurrentUser):
    """Release evidence for governance and audit. Contains rates and summaries, never raw attack content."""
    app = get_or_404(db, Application, app_id, "Application")
    scan = db.get(RedTeamScan, app.release.get("scanId")) if app.release.get("scanId") else None
    th = thresholds(db)[app.tier]
    ev = db.get(EvaluationRun, app.release.get("evaluationRunId")) if app.release.get("evaluationRunId") else None
    return {
        "generatedAt": now(), "generatedBy": f"{user.name} ({user.role})",
        "application": {k: v for k, v in to_api(app).items() if k in ("id", "name", "type", "tier", "owner", "ecMember", "profile")},
        "release": app.release,
        "gate": gate_for(db, app),
        "evaluation": ev and {"id": ev.id, "judge": ev.judge, "dataset": ev.dataset, "cases": ev.cases, "metrics": ev.metrics, "finishedAt": ev.finished_at},
        "scan": scan and {
            "id": scan.id, "attackEngine": scan.attack_model, "attempts": scan.attempts, "successes": scan.successes, "complexities": scan.complexities,
            "categories": [{"category": h["category"], "asr": h["overall"]} for h in scan.heat], "canaryLeaks": scan.canary_leaks,
            "scenarios": [{"id": s["id"], "name": s["name"], "defended": s["defended"]} for s in scan.scenarios],
        },
        "findings": [{k: v for k, v in finding_out(f, user.role).items() if k not in ("history", "evidence")}
                     for f in db.query(Finding).filter(Finding.app_id == app.id)],
        "regressionTests": [to_api(r) for r in db.query(RegressionTest).filter(RegressionTest.app_id == app.id)],
        "runs": [to_api(r) for r in db.query(RunRecord).filter(RunRecord.app_id == app.id).order_by(RunRecord.at.desc()).limit(20)],
        "approvals": {"required": th["signOff"], "recorded": app.release.get("signOffs", [])},
        "thresholds": th,
    }
