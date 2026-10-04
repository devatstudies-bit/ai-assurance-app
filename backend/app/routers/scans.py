from fastapi import APIRouter, HTTPException, status

from ..framework import AGENT_ONLY_CATEGORIES, RISK_CATEGORIES, Perm
from ..models import Application, ModelDeployment, RedTeamScan
from ..schemas import ScanCreate
from ..security import CurrentUser, require
from ..serialize import to_api
from ..services import scans as svc
from .common import Db, get_or_404

router = APIRouter(prefix="/api/scans", tags=["Red team scans"])


def scan_out(scan: RedTeamScan, view_content: bool) -> dict:
    d = to_api(scan)
    if not view_content:
        # Transcript locations stay with Security and authorized testers
        d["scenarios"] = [{k: v for k, v in s.items() if k != "transcript"} for s in d["scenarios"]]
    return d


@router.get("")
def list_scans(db: Db, user: CurrentUser, app: str | None = None):
    q = db.query(RedTeamScan)
    if app:
        q = q.filter(RedTeamScan.app_id == app)
    return [scan_out(s, user.can(Perm.VIEW_ATTACK_CONTENT)) for s in q.order_by(RedTeamScan.started_at.desc())]


@router.get("/{scan_id}")
def get_scan(scan_id: str, db: Db, user: CurrentUser):
    return scan_out(get_or_404(db, RedTeamScan, scan_id, "Scan"), user.can(Perm.VIEW_ATTACK_CONTENT))


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def start_scan(body: ScanCreate, db: Db, user: CurrentUser):
    """Starts an automated scan against the app's registered sandbox. Poll GET /api/scans/{id} for progress."""
    require(user, Perm.RUN_SCANS)
    app = get_or_404(db, Application, body.app_id, "Application")
    categories = body.categories
    if not categories:
        prev = db.query(RedTeamScan).filter_by(app_id=app.id, status="Completed").order_by(RedTeamScan.started_at.desc()).first()
        categories = [h["category"] for h in prev.heat] if prev else [c for c in RISK_CATEGORIES if c not in AGENT_ONLY_CATEGORIES][:6]
    unknown = [c for c in categories if c not in RISK_CATEGORIES]
    if unknown:
        raise HTTPException(422, f"Unknown risk categories: {', '.join(unknown)}")
    if app.type in ("RAG assistant", "Chat tool") and AGENT_ONLY_CATEGORIES & set(categories):
        raise HTTPException(422, "Agent-only categories apply to agents, multi-agent systems and MCP servers")

    if body.attack_model_id:
        attack = get_or_404(db, ModelDeployment, body.attack_model_id, "Model")
    else:
        attack = db.query(ModelDeployment).filter_by(purpose="attack", is_default=True).first()
        if attack is None:
            raise HTTPException(409, "No default attack model is configured")
    if attack.purpose != "attack":
        raise HTTPException(422, f"{attack.name} is a judge model, not an attack model")
    if not attack.enabled:
        raise HTTPException(409, f"{attack.name} is disabled")

    scan = svc.start_scan(db, app, attack, body.mode, body.complexities, body.strategies, categories)
    db.commit()
    svc.launch(scan.id)
    return to_api(scan)
