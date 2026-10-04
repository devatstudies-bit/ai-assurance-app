"""Findings management (section 8): lifecycle, deadlines and the regression-test rule."""

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..framework import FINDING_FLOW, OPEN_STATUSES, SEVERITY_DAYS, Perm
from ..models import Application, Finding, LibraryItem, RegressionTest
from ..security import User
from ..util import add_days, next_id, now


def due_for(opened_at: str, severity: str) -> str | None:
    days = SEVERITY_DAYS[severity]
    return None if days is None else add_days(opened_at, days)


def blocked_reason(f: Finding, to: str, user: User) -> str | None:
    """Why `user` may not move `f` to `to`, or None when the move is allowed."""
    if f.status == to:
        return "Already in this state"
    if not user.can(Perm.MOVE_FINDINGS) and to != "Accepted risk":
        return f"{user.role} has read-only access to findings"
    if f.status not in OPEN_STATUSES:
        return "Finding is no longer open"
    if to == "Accepted risk":
        return None if user.can(Perm.ACCEPT_RISK) else "Only the governance board can accept risk"
    if to == "Triaged" and not user.can(Perm.TRIAGE):
        return "Triage is led by Security"
    if to not in FINDING_FLOW:
        return f"Unknown status {to}"
    src, dst = FINDING_FLOW.index(f.status), FINDING_FLOW.index(to)
    if dst == src + 1 or (f.status == "Retest pending" and to == "In fix"):
        return None
    return f"Cannot move from {f.status} to {to}"


def create_finding(db: Session, by: str, **fields: Any) -> Finding:
    opened = now()
    f = Finding(
        id=next_id(db, "FND"), status=fields.pop("status", "New"), opened_at=opened,
        due_at=due_for(opened, fields["severity"]),
        history=[{"at": opened, "by": by, "text": f"Logged from {fields['source'].lower()} {fields['source_ref']}"}],
        **fields,
    )
    db.add(f)
    return f


def _bump_regression_set(db: Session, app_id: str) -> None:
    item = db.query(LibraryItem).filter_by(app_id=app_id, kind="Regression set").first()
    if item:
        item.items += 1
        item.version += 1
        item.updated_at = now()
        return
    app = db.get(Application, app_id)
    count = db.query(LibraryItem).count()
    db.add(LibraryItem(
        id=f"LIB-{count + 1:03d}", app_id=app_id, kind="Regression set", name=f"{app.name} regression", version=1, items=1,
        updated_at=now(), restricted=False, coverage="Closed findings 100%", path=f"datasets/{app_id}/regression.jsonl",
    ))


def move_finding(db: Session, f: Finding, to: str, user: User, *, regression_title: str | None = None,
                 acceptance: dict[str, Any] | None = None, note: str | None = None) -> Finding:
    if reason := blocked_reason(f, to, user):
        raise HTTPException(status.HTTP_409_CONFLICT if user.can(Perm.MOVE_FINDINGS) or user.can(Perm.ACCEPT_RISK) else status.HTTP_403_FORBIDDEN, reason)

    text = note or f"Moved to {to}"
    if to == "Closed":
        # The rule that connects everything: a finding cannot close until its attack is in the regression set
        if not f.regression_test_id:
            if not regression_title or not regression_title.strip():
                raise HTTPException(422, "A regression test is required to close a finding")
            reg = RegressionTest(id=next_id(db, "REG"), app_id=f.app_id, finding_id=f.id, title=regression_title.strip(), added_at=now())
            db.add(reg)
            _bump_regression_set(db, f.app_id)
            f.regression_test_id = reg.id
            text = f"Closed; regression test {reg.id} added to the evaluation suite"
        f.closed_at = now()
    elif to == "Accepted risk":
        if not acceptance or not acceptance.get("controls") or not acceptance.get("expires"):
            raise HTTPException(422, "Accepted risk needs an expiry date and compensating controls")
        f.acceptance = {"approvedBy": "Governance board", "expires": acceptance["expires"], "controls": acceptance["controls"]}
        text = f"Risk accepted until {acceptance['expires'][:10]}"
    elif to == "Triaged" and f.owner == "Unassigned":
        app = db.get(Application, f.app_id)
        if app:
            f.owner = app.owner
    elif to == "In fix" and not f.work_item:
        # Integration point: create the linked Azure DevOps / Jira work item here
        f.work_item = f"ADO-{58000 + int(f.id.split('-')[1])}"
        text += f"; linked {f.work_item}"

    f.status = to
    f.history = [*f.history, {"at": now(), "by": user.name, "text": text}]
    return f


def update_finding(f: Finding, user: User, *, owner: str | None, severity: str | None, work_item: str | None) -> Finding:
    changes = []
    if owner is not None and owner != f.owner:
        f.owner = owner
        changes.append(f"owner → {owner}")
    if severity is not None and severity != f.severity:
        f.severity = severity
        f.due_at = due_for(f.opened_at, severity)
        changes.append(f"severity → {severity}")
    if work_item is not None and work_item != f.work_item:
        f.work_item = work_item
        changes.append(f"work item → {work_item}")
    if changes:
        f.history = [*f.history, {"at": now(), "by": user.name, "text": "Updated " + ", ".join(changes)}]
    return f
