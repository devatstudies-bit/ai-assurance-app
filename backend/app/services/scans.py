"""Run orchestrator for automated red team scans: creates the scan, runs the adapter in the
background, writes results, applies auto-logging of findings and records the run."""

import logging
import threading

from sqlalchemy.orm import Session

from ..adapters.base import RedTeamAdapter, ScanRequest
from ..adapters.simulated import SimulatedAdapter
from ..config import settings
from ..db import SessionLocal
from ..framework import OPEN_STATUSES
from ..gate import scan_asr
from ..models import Application, Finding, GateThresholdSet, ModelDeployment, RedTeamScan, RunRecord
from ..serialize import to_api
from .findings import create_finding
from ..util import next_id, now

log = logging.getLogger(__name__)

_override: RedTeamAdapter | None = None  # tests can force an adapter


def set_adapter(adapter: RedTeamAdapter | None) -> None:
    global _override
    _override = adapter


def adapter_for(attack: ModelDeployment) -> RedTeamAdapter:
    """The attack model selected for a scan decides which engine runs it."""
    if _override is not None:
        return _override
    if attack.provider == "azure-redteam-service":
        from ..adapters.azure_redteam import AzureRedTeamAdapter  # noqa: PLC0415

        return AzureRedTeamAdapter(attack.endpoint, settings.azure_attack_objectives)
    return SimulatedAdapter(settings.simulated_scan_seconds)


def start_scan(db: Session, app: Application, attack: ModelDeployment, mode: str, complexities: list[str], strategies: list[str], categories: list[str]) -> RedTeamScan:
    scan = RedTeamScan(
        id=next_id(db, "RT"), app_id=app.id, version=app.release["version"], mode=mode, status="Running", progress=0,
        started_at=now(), complexities=complexities, strategies=strategies, categories=categories,
        attack_model=attack.name + (f" ({attack.model_version})" if attack.model_version else ""), attack_model_id=attack.id,
    )
    db.add(scan)
    return scan


def launch(scan_id: str, *, background: bool = True) -> None:
    if background:
        threading.Thread(target=run_scan, args=(scan_id,), daemon=True, name=f"scan-{scan_id}").start()
    else:
        run_scan(scan_id)


def run_scan(scan_id: str) -> None:
    with SessionLocal() as db:
        scan = db.get(RedTeamScan, scan_id)
        app = db.get(Application, scan.app_id)
        attack = db.get(ModelDeployment, scan.attack_model_id) if scan.attack_model_id else None
        if attack is not None:
            db.expunge(attack)
        prev = (
            db.query(RedTeamScan)
            .filter(RedTeamScan.app_id == app.id, RedTeamScan.status == "Completed", RedTeamScan.id != scan.id)
            .order_by(RedTeamScan.started_at.desc())
            .first()
        )
        open_findings = db.query(Finding).filter(Finding.app_id == app.id, Finding.status.in_(OPEN_STATUSES)).all()
        req = ScanRequest(
            scan_id=scan.id, app_id=app.id, app_type=app.type, version=scan.version, target=app.sandbox,
            complexities=scan.complexities, strategies=scan.strategies, categories=scan.categories,
            previous=to_api(prev) if prev else None,
            open_categories={f.category for f in open_findings}, open_finding_ids={f.id for f in open_findings},
            seed=int(scan.id.split("-")[1]),
        )

    def progress(p: int) -> None:
        with SessionLocal() as s:
            row = s.get(RedTeamScan, scan_id)
            row.progress = p
            s.commit()

    try:
        if attack is None:
            raise RuntimeError("The attack model for this scan no longer exists")
        outcome = adapter_for(attack).run(req, progress)
    except Exception as exc:  # noqa: BLE001 - any adapter failure marks the scan failed
        log.exception("Scan %s failed", scan_id)
        with SessionLocal() as db:
            row = db.get(RedTeamScan, scan_id)
            row.status, row.error = "Failed", str(exc)[:2000]
            db.commit()
        return

    with SessionLocal() as db:
        complete_scan(db, scan_id, outcome)
        db.commit()


def complete_scan(db: Session, scan_id: str, outcome) -> RedTeamScan:
    scan = db.get(RedTeamScan, scan_id)
    app = db.get(Application, scan.app_id)
    scan.status, scan.progress = "Completed", 100
    scan.attempts, scan.successes = outcome.attempts, outcome.successes
    scan.heat, scan.by_complexity, scan.scenarios = outcome.heat, outcome.by_complexity, outcome.scenarios
    scan.canary_leaks, scan.summary, scan.duration_min = outcome.canary_leaks, outcome.summary, outcome.duration_min

    # Auto-log a finding for each category over its limit that has no open finding yet
    t = db.get(GateThresholdSet, app.tier).data
    open_cats = {f.category for f in db.query(Finding).filter(Finding.app_id == app.id, Finding.status.in_(OPEN_STATUSES))}
    for h in scan.heat:
        if h["overall"] > t["maxAsrCategory"] and h["category"] not in open_cats:
            top = max(h["cells"].items(), key=lambda kv: kv[1])[0] if h["cells"] else "n/a"
            create_finding(
                db, "Scan engine", app_id=app.id, title=f"{h['category']} attack success rate {h['overall']:.1f}% exceeds {t['maxAsrCategory']:g}% category limit",
                severity="Medium", source="Automated scan", source_ref=scan.id, category=h["category"], owasp=[], owner="Unassigned",
                found_in="Production" if app.stage == "Production" else "Pre-release", evidence=f"Highest strategy: {top}",
            )

    # A release scan becomes the scan of record for the release candidate
    if scan.mode == "Release":
        app.release = {**app.release, "scanId": scan.id}
        value = round(scan_asr(scan), 1)
        hist = [h for h in app.asr_history if h["version"] != scan.version]
        app.asr_history = [*hist, {"version": scan.version, "asr": value}]

    kind = {"Scheduled": "Scheduled scan", "Developer": "Developer scan"}.get(scan.mode, "Release scan")
    db.add(RunRecord(id=next_id(db, "RUN"), app_id=app.id, at=now(), kind=kind, version=scan.version,
                     detail=f"Automated, {', '.join(scan.complexities).lower()} complexity", result="Completed", ref=scan.id))
    return scan
