from fastapi import APIRouter, HTTPException, status

from ..framework import EDITABLE_THRESHOLDS, ROLES, Perm
from ..models import (
    Application, Authorization, EvaluationRun, Finding, GateThresholdSet, LibraryItem, ManualSession, ModelDeployment, RedTeamScan,
    RegressionTest, RunRecord,
)
from ..schemas import ThresholdPatch
from ..security import CurrentUser, require
from ..seed import reset_db
from ..serialize import authorization_out, finding_out, library_out, to_api
from .common import Db, app_out, get_or_404, thresholds
from .models import model_out
from .scans import scan_out

router = APIRouter(prefix="/api", tags=["Administration"])


@router.get("/me")
def me(user: CurrentUser):
    return {"role": user.role, "user": user.name, "permissions": sorted(ROLES[user.role]["perms"])}


@router.get("/thresholds")
def get_thresholds(db: Db):
    return thresholds(db)


@router.patch("/thresholds/{tier}")
def patch_thresholds(tier: str, body: ThresholdPatch, db: Db, user: CurrentUser):
    require(user, Perm.EDIT_THRESHOLDS, "Gate thresholds are maintained by the AI platform and approved by governance")
    row = get_or_404(db, GateThresholdSet, tier, "Tier")
    patch = body.model_dump(by_alias=True, exclude_none=True)
    if not set(patch) <= EDITABLE_THRESHOLDS:
        raise HTTPException(422, "Only ASR limits, complexity and scenario rules are editable")
    if "complexity" in patch and not patch["complexity"]:
        raise HTTPException(422, "At least one complexity level is required")
    row.data = {**row.data, **patch}
    db.commit()
    return row.data


@router.get("/library")
def list_library(db: Db, user: CurrentUser):
    return [library_out(i, user.role) for i in db.query(LibraryItem).order_by(LibraryItem.id)]


@router.get("/regression-tests")
def list_regression_tests(db: Db):
    return [to_api(r) for r in db.query(RegressionTest).order_by(RegressionTest.added_at.desc())]


@router.get("/runs")
def list_runs(db: Db, app: str | None = None, kind: str | None = None):
    q = db.query(RunRecord)
    if app:
        q = q.filter(RunRecord.app_id == app)
    if kind:
        q = q.filter(RunRecord.kind == kind)
    return [to_api(r) for r in q.order_by(RunRecord.at.desc())]


@router.get("/state")
def state(db: Db, user: CurrentUser):
    """Everything the web client renders, in one call, filtered for the caller's role."""
    th = thresholds(db)
    findings = db.query(Finding).all()
    manual = user.can(Perm.MANUAL_TESTING)
    view = user.can(Perm.VIEW_ATTACK_CONTENT)
    return {
        "role": user.role,
        "user": user.name,
        "applications": [app_out(db, a, findings, th) for a in db.query(Application).order_by(Application.name)],
        "scans": [scan_out(s, view) for s in db.query(RedTeamScan).order_by(RedTeamScan.started_at.desc())],
        "findings": [finding_out(f, user.role) for f in sorted(findings, key=lambda f: f.opened_at, reverse=True)],
        "library": [library_out(i, user.role) for i in db.query(LibraryItem).order_by(LibraryItem.id)],
        "regressionTests": [to_api(r) for r in db.query(RegressionTest).order_by(RegressionTest.added_at.desc())],
        "runs": [to_api(r) for r in db.query(RunRecord).order_by(RunRecord.at.desc())],
        "sessions": [to_api(s) for s in db.query(ManualSession).order_by(ManualSession.start.desc())] if manual else [],
        "authorizations": [authorization_out(a) for a in db.query(Authorization)] if manual else [],
        "thresholds": th,
        "models": [model_out(m) for m in db.query(ModelDeployment).order_by(ModelDeployment.purpose, ModelDeployment.is_default.desc(), ModelDeployment.name)],
        # Case-level detail stays on GET /api/evaluations/{id}; the snapshot carries summaries
        "evaluations": [{**to_api(r), "caseResults": []} for r in db.query(EvaluationRun).order_by(EvaluationRun.started_at.desc())],
    }


@router.post("/admin/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset(user: CurrentUser):
    require(user, Perm.EDIT_THRESHOLDS, "Only the AI platform or governance can reset data")
    reset_db()
