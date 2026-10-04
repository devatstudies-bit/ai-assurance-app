"""Manual testing workspace (section 7.5) with the safety rules from section 7.6."""

from fastapi import APIRouter, HTTPException, status

from ..framework import Perm
from ..models import Application, Authorization, ManualSession, RunRecord
from ..schemas import AttemptCreate, AttemptFinding, SessionCreate, SessionStatus
from ..security import CurrentUser, require
from ..serialize import authorization_out, finding_out, to_api
from ..services.findings import create_finding
from ..util import next_id, now, parse
from .common import Db, get_or_404

router = APIRouter(prefix="/api", tags=["Manual testing"])


@router.get("/authorizations")
def list_authorizations(db: Db, user: CurrentUser):
    require(user, Perm.MANUAL_TESTING)
    return [authorization_out(a) for a in db.query(Authorization)]


@router.get("/sessions")
def list_sessions(db: Db, user: CurrentUser):
    require(user, Perm.MANUAL_TESTING)
    return [to_api(s) for s in db.query(ManualSession).order_by(ManualSession.start.desc())]


@router.get("/sessions/{session_id}")
def get_session(session_id: str, db: Db, user: CurrentUser):
    require(user, Perm.MANUAL_TESTING)
    return to_api(get_or_404(db, ManualSession, session_id, "Session"))


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
def plan_session(body: SessionCreate, db: Db, user: CurrentUser):
    require(user, Perm.MANUAL_TESTING)
    app = get_or_404(db, Application, body.app_id, "Application")
    auth = db.get(Authorization, body.authorization_id)
    # No red teaming without written authorization naming the application, environment, period and testers
    if auth is None or auth.app_id != app.id:
        raise HTTPException(status.HTTP_409_CONFLICT, f"No written authorization {body.authorization_id} on file for {app.name}")
    if auth.environment not in ("Sandbox", "Staging"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Red teaming is limited to sandbox or staging environments")
    n = db.query(ManualSession).count() + 14
    s = ManualSession(
        id=f"EX-{n:03d}", app_id=app.id, authorization_id=auth.id, title=body.title or f"Expert exercise: {app.name} {app.release['version']}",
        status="Planned", start=auth.from_, end=auth.to, testers=auth.testers, objectives=body.objectives, opt_outs=body.opt_outs, attempts=[],
    )
    db.add(s)
    db.commit()
    return to_api(s)


@router.post("/sessions/{session_id}/status")
def set_status(session_id: str, body: SessionStatus, db: Db, user: CurrentUser):
    require(user, Perm.MANUAL_TESTING)
    s = get_or_404(db, ManualSession, session_id, "Session")
    if body.status == "Active":
        auth = db.get(Authorization, s.authorization_id)
        if auth and parse(auth.to) < parse(now()):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Authorization {auth.id} expired; renew it before testing")
    s.status = body.status
    if body.status == "Completed":
        app = db.get(Application, s.app_id)
        app.last_manual_test = now()
        found = sum(1 for a in s.attempts if a.get("findingId"))
        db.add(RunRecord(id=next_id(db, "RUN"), app_id=app.id, at=now(), kind="Manual exercise", version=app.release["version"],
                         detail=f"{len(s.testers)} testers, {len(s.attempts)} attempts, {found} finding{'' if found == 1 else 's'}",
                         result="Completed", ref=s.id))
    db.commit()
    return to_api(s)


@router.post("/sessions/{session_id}/attempts", status_code=status.HTTP_201_CREATED)
def log_attempt(session_id: str, body: AttemptCreate, db: Db, user: CurrentUser):
    require(user, Perm.MANUAL_TESTING)
    s = get_or_404(db, ManualSession, session_id, "Session")
    if s.status != "Active":
        raise HTTPException(status.HTTP_409_CONFLICT, "Attempts can only be logged while the session is active")
    if body.category in s.opt_outs:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{body.category} is opted out for this session")
    attempt = {**body.model_dump(by_alias=True), "id": f"A-{len(s.attempts) + 1}", "at": now(), "tester": user.name}
    s.attempts = [*s.attempts, attempt]
    db.commit()
    return attempt


@router.post("/sessions/{session_id}/attempts/{attempt_id}/finding", status_code=status.HTTP_201_CREATED)
def finding_from_attempt(session_id: str, attempt_id: str, body: AttemptFinding, db: Db, user: CurrentUser):
    """Quick finding creation from a logged attempt; links the two."""
    require(user, Perm.LOG_FINDING)
    s = get_or_404(db, ManualSession, session_id, "Session")
    attempt = next((a for a in s.attempts if a["id"] == attempt_id), None)
    if attempt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Attempt {attempt_id} not found")
    if attempt.get("findingId"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Attempt already linked to {attempt['findingId']}")
    app = db.get(Application, s.app_id)
    f = create_finding(db, user.name, app_id=app.id, title=body.title, severity=body.severity, category=body.category, owasp=body.owasp,
                       source="Manual exercise", source_ref=f"{s.id} · {attempt_id}", owner="Unassigned",
                       evidence=body.evidence or attempt.get("note") or "See session log",
                       found_in="Production" if app.stage == "Production" else "Pre-release")
    s.attempts = [{**a, "findingId": f.id} if a["id"] == attempt_id else a for a in s.attempts]
    db.commit()
    return finding_out(f, user.role)
