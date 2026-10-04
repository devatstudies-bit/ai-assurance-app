from fastapi import APIRouter, Query, status

from ..framework import Perm
from ..models import Application, Finding
from ..schemas import FindingCreate, FindingUpdate, Transition
from ..security import CurrentUser, require
from ..serialize import finding_out
from ..services import findings as svc
from .common import Db, get_or_404

router = APIRouter(prefix="/api/findings", tags=["Findings"])


@router.get("")
def list_findings(db: Db, user: CurrentUser, app: str | None = None, status_: str | None = Query(None, alias="status"), severity: str | None = None):
    q = db.query(Finding)
    if app:
        q = q.filter(Finding.app_id == app)
    if status_:
        q = q.filter(Finding.status == status_)
    if severity:
        q = q.filter(Finding.severity == severity)
    return [finding_out(f, user.role) for f in q.order_by(Finding.opened_at.desc())]


@router.get("/{finding_id}")
def get_finding(finding_id: str, db: Db, user: CurrentUser):
    return finding_out(get_or_404(db, Finding, finding_id, "Finding"), user.role)


@router.post("", status_code=status.HTTP_201_CREATED)
def log_finding(body: FindingCreate, db: Db, user: CurrentUser):
    require(user, Perm.LOG_FINDING)
    app = get_or_404(db, Application, body.app_id, "Application")
    f = svc.create_finding(
        db, user.name, app_id=app.id, title=body.title, severity=body.severity, category=body.category, owasp=body.owasp,
        source=body.source, source_ref=body.source_ref, owner="Unassigned", evidence=body.evidence,
        found_in="Production" if app.stage == "Production" else "Pre-release",
    )
    db.commit()
    return finding_out(f, user.role)


@router.patch("/{finding_id}")
def update_finding(finding_id: str, body: FindingUpdate, db: Db, user: CurrentUser):
    require(user, Perm.TRIAGE, "Severity and ownership are set during triage by Security")
    f = svc.update_finding(get_or_404(db, Finding, finding_id, "Finding"), user, owner=body.owner, severity=body.severity, work_item=body.work_item)
    db.commit()
    return finding_out(f, user.role)


@router.post("/{finding_id}/transitions")
def transition(finding_id: str, body: Transition, db: Db, user: CurrentUser):
    """Moves a finding through the lifecycle. Closing requires `regressionTitle` unless a regression test already exists;
    accepting risk requires `acceptance` and the governance role."""
    f = get_or_404(db, Finding, finding_id, "Finding")
    svc.move_finding(db, f, body.to, user, regression_title=body.regression_title,
                     acceptance=body.acceptance.model_dump() if body.acceptance else None, note=body.note)
    db.commit()
    return finding_out(f, user.role)
