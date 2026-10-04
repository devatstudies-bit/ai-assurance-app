from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..gate import evaluate_gate
from ..models import Application, Finding, GateThresholdSet, ModelDeployment, RedTeamScan
from ..serialize import to_api

Db = Annotated[Session, Depends(get_db)]


def get_or_404(db: Session, model, key: str, label: str):
    obj = db.get(model, key)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} {key} not found")
    return obj


def thresholds(db: Session) -> dict[str, dict[str, Any]]:
    return {t.tier: t.data for t in db.query(GateThresholdSet).all()}


def gate_for(db: Session, app: Application, findings: list[Finding] | None = None, th: dict | None = None) -> dict[str, Any]:
    scan = db.get(RedTeamScan, app.release.get("scanId")) if app.release.get("scanId") else None
    findings = findings if findings is not None else db.query(Finding).filter(Finding.app_id == app.id).all()
    th = th or thresholds(db)
    judge = db.get(ModelDeployment, app.release["judgeModelId"]) if app.release.get("judgeModelId") else None
    return evaluate_gate(app, scan, findings, th[app.tier], judge)


def app_out(db: Session, app: Application, findings: list[Finding] | None = None, th: dict | None = None) -> dict[str, Any]:
    return {**to_api(app), "gate": gate_for(db, app, findings, th)}
