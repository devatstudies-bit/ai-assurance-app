"""Evaluation runs (section 6): score a release's golden dataset with the selected judge model.

Judge metrics go to the judge LLM with the shared rubrics; deterministic metrics are computed in code.
A pre-release run becomes the release's evaluation of record, so the gate reads real scores.
"""

import json
import logging
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from statistics import mean
from typing import Any

from sqlalchemy.orm import Session

from ..adapters.target import call_target
from ..config import settings
from ..db import SessionLocal
from ..framework import PROFILES
from ..llm.client import LLMError, secret_configured
from ..llm.judge import judge
from ..models import Application, EvaluationRun, LibraryItem, ModelDeployment, RunRecord
from ..serialize import to_api
from ..util import next_id, now

log = logging.getLogger(__name__)

DATASET_KINDS = ("Golden dataset", "Agent scenarios")


def model_snapshot(m: ModelDeployment) -> dict[str, Any]:
    return {k: v for k, v in to_api(m).items() if k in ("id", "name", "provider", "deployment", "modelVersion", "endpoint", "effort", "calibration")}


def default_dataset(db: Session, app_id: str) -> LibraryItem | None:
    return (
        db.query(LibraryItem)
        .filter(LibraryItem.app_id == app_id, LibraryItem.kind.in_(DATASET_KINDS))
        .order_by(LibraryItem.version.desc())
        .first()
    )


def start_evaluation(db: Session, app: Application, judge_model: ModelDeployment, dataset: LibraryItem | None, mode: str) -> EvaluationRun:
    run = EvaluationRun(
        id=next_id(db, "EV"), app_id=app.id, version=app.release["version"], mode=mode, status="Running", progress=0,
        started_at=now(), judge_model_id=judge_model.id, judge=model_snapshot(judge_model),
        dataset_id=dataset.id if dataset else None, dataset=dataset.path if dataset else "—", profile=app.profile,
    )
    db.add(run)
    return run


def launch(run_id: str, *, background: bool = True) -> None:
    if background:
        threading.Thread(target=run_evaluation, args=(run_id,), daemon=True, name=f"eval-{run_id}").start()
    else:
        run_evaluation(run_id)


def _set_progress(run_id: str, p: int) -> None:
    with SessionLocal() as s:
        row = s.get(EvaluationRun, run_id)
        row.progress = p
        s.commit()


def run_evaluation(run_id: str) -> None:
    with SessionLocal() as db:
        run = db.get(EvaluationRun, run_id)
        app = db.get(Application, run.app_id)
        model = db.get(ModelDeployment, run.judge_model_id)
        profile = PROFILES.get(run.profile)
        prior = {m["name"]: m["value"] for m in app.release.get("metrics", [])}
        prior_safety, prior_passk, sandbox = app.release.get("contentSafetyDefectPct", 0), app.release.get("passK"), app.sandbox
        db.expunge(model)

    try:
        if profile is None:
            raise LLMError(f"No evaluation profile {run.profile}")
        if model.provider != "simulated" and not secret_configured(model):
            raise LLMError(f"{model.name}: environment variable {model.api_key_env} is not set on the API server")
        if model.provider == "simulated":
            result = _simulate(run_id, profile, prior, prior_safety, prior_passk)
        else:
            cases = _load_dataset(run.dataset)
            result = _evaluate(run_id, model, profile, cases, sandbox)
    except Exception as exc:  # noqa: BLE001 - any failure marks the run failed
        log.warning("Evaluation %s failed: %s", run_id, exc)
        with SessionLocal() as db:
            row = db.get(EvaluationRun, run_id)
            row.status, row.error, row.finished_at = "Failed", str(exc)[:2000], now()
            db.commit()
        return

    with SessionLocal() as db:
        complete_evaluation(db, run_id, result)
        db.commit()


def complete_evaluation(db: Session, run_id: str, result: dict[str, Any]) -> EvaluationRun:
    run = db.get(EvaluationRun, run_id)
    app = db.get(Application, run.app_id)
    run.status, run.progress, run.finished_at = "Completed", 100, now()
    run.metrics, run.cases, run.case_results = result["metrics"], result["cases"], result["caseResults"]
    run.content_safety_defect_pct, run.pass_k, run.judge_calls = result["contentSafety"], result["passK"], result["judgeCalls"]

    all_pass = all((m["value"] >= m["limit"]) if m["op"] == ">=" else (m["value"] <= m["limit"]) for m in run.metrics) and not run.content_safety_defect_pct
    if run.mode == "Pre-release":
        release = {**app.release, "metrics": [{k: m[k] for k in ("name", "value", "limit", "op", "format")} for m in run.metrics],
                   "contentSafetyDefectPct": run.content_safety_defect_pct or 0, "evaluationRunId": run.id, "judgeModelId": run.judge_model_id}
        if run.pass_k is not None:
            release["passK"] = run.pass_k
        app.release = release
    db.add(RunRecord(
        id=next_id(db, "RUN"), app_id=app.id, at=now(), kind="Evaluation" if run.mode == "Pre-release" else "Online evaluation",
        version=run.version, detail=f"{run.cases} cases scored by {run.judge['name']}",
        result=("Completed" if run.mode == "Pre-release" else "Within limits") if all_pass else ("Completed" if run.mode == "Pre-release" else "Alert"),
        ref=run.id,
    ))
    return run


# ---------- Simulated judge ----------

def _simulate(run_id: str, profile: dict, prior: dict[str, float], prior_safety: float, prior_passk: float | None) -> dict[str, Any]:
    steps = 5
    for i in range(1, steps):
        time.sleep(settings.simulated_eval_seconds / steps)
        _set_progress(run_id, i * 100 // steps)
    r = random.Random(run_id)
    metrics = []
    for d in profile["metrics"]:
        base = prior.get(d["name"])
        if base is None:  # new application: start just past the threshold
            base = d["limit"] * (1.04 if d["op"] == ">=" else 0.5)
        jitter = {"score": 0.1, "ratio": 0.01, "pct": 0.5}[d["format"]] * r.choice([-1, 0, 0, 1])
        value = base + jitter if base else base
        if d["op"] == ">=" and d["format"] == "ratio":
            value = min(1.0, value)
        metrics.append(_metric(d, max(0.0, value)))
    return {"metrics": metrics, "contentSafety": prior_safety if profile["content_safety"] else None,
            "passK": prior_passk if profile["pass_k"] else None, "cases": 0, "caseResults": [], "judgeCalls": 0}


# ---------- LLM judge ----------

def _load_dataset(path: str) -> list[dict[str, Any]]:
    file = Path(settings.library_dir) / path
    if not file.is_file():
        raise LLMError(f"Dataset file not found: {file}. Add the JSONL file to the test library directory.")
    cases = [json.loads(line) for line in file.read_text().splitlines() if line.strip()]
    if not cases:
        raise LLMError(f"Dataset {path} is empty")
    return cases


def _round(fmt: str, v: float) -> float:
    return round(v, 2) if fmt == "ratio" else round(v, 1)


def _metric(d: dict, value: float) -> dict[str, Any]:
    return {**{k: d[k] for k in ("name", "key", "kind", "limit", "op", "format")}, "value": _round(d["format"], value)}


def _evaluate(run_id: str, model: ModelDeployment, profile: dict, cases: list[dict[str, Any]], sandbox: str) -> dict[str, Any]:
    # Responses are recorded in the dataset or fetched live from the app's sandbox
    for c in cases:
        if not c.get("response") and c.get("query"):
            c["response"] = call_target(sandbox, [{"role": "user", "content": c["query"]}])

    jobs: list[tuple[int, str, dict[str, Any]]] = []  # (case index, rubric key, fields)
    judge_keys = {d["key"] for d in profile["metrics"] if d["kind"] == "judge"}
    for i, c in enumerate(cases):
        base = {"query": c.get("query"), "response": c.get("response")}
        answerable = c.get("answerable", True)
        if "groundedness" in judge_keys and answerable and c.get("context"):
            jobs.append((i, "groundedness", {**base, "context": c["context"]}))
        if "relevance" in judge_keys and answerable:
            jobs.append((i, "relevance", base))
        if "completeness" in judge_keys and answerable and c.get("groundTruth"):
            jobs.append((i, "completeness", {**base, "ground truth": c["groundTruth"]}))
        if "unanswerable" in judge_keys and not answerable:
            jobs.append((i, "unanswerable", base))
        if "fluency" in judge_keys:
            jobs.append((i, "fluency", base))
        if "style_adherence" in judge_keys:
            jobs.append((i, "style_adherence", {**base, "style guide": c.get("styleGuide")}))
        for key in ("task_completion", "task_adherence"):
            if key in judge_keys:
                jobs.append((i, key, {**base, "instructions": c.get("instructions")}))
        if profile["content_safety"]:
            jobs.append((i, "content_safety", base))
        if profile["pass_k"]:
            for k, extra in enumerate(c.get("runs", [])):
                jobs.append((i, f"pass_k:{k}", {"query": c.get("query"), "response": extra, "instructions": c.get("instructions")}))

    results: dict[tuple[int, str], Any] = {}
    done = 0

    errors: list[str] = []

    def work(job):
        i, key, fields = job
        rubric = "task_completion" if key.startswith("pass_k:") else key
        try:
            return (i, key), judge(model, rubric, fields)
        except (LLMError, KeyError, ValueError) as exc:
            return (i, key), exc

    with ThreadPoolExecutor(max_workers=settings.llm_max_workers) as pool:
        for (ik, verdict) in pool.map(work, jobs):
            if isinstance(verdict, Exception):
                errors.append(str(verdict))
            else:
                results[ik] = verdict
            done += 1
            if done % max(1, len(jobs) // 10) == 0:
                _set_progress(run_id, min(95, done * 100 // max(1, len(jobs))))
    # A few failed judge calls are tolerated; systematic failure (bad key, wrong deployment) fails the run
    if jobs and len(errors) > 0.2 * len(jobs):
        raise LLMError(f"{len(errors)} of {len(jobs)} judge calls failed. First error: {errors[0]}")

    def judged(key: str) -> list:
        return [v for (_, k), v in results.items() if k == key]

    metrics = []
    for d in profile["metrics"]:
        key = d["key"]
        if d["kind"] == "judge":
            vs = judged(key)
            if not vs:
                continue
            if key == "unanswerable":
                value = sum(1 for v in vs if not v.passed) / len(vs) * 100
            else:
                value = mean(v.value for v in vs)
        else:
            value = _deterministic(key, cases)
            if value is None:
                continue
        metrics.append(_metric(d, value))

    safety = judged("content_safety")
    content_safety = round(sum(1 for v in safety if not v.passed) / len(safety) * 100, 1) if safety else None

    pass_k = None
    if profile["pass_k"]:
        per_case = []
        for i, c in enumerate(cases):
            runs = [results.get((i, "task_completion"))] + [results.get((i, f"pass_k:{k}")) for k in range(len(c.get("runs", [])))]
            runs = [v for v in runs if v is not None]
            if runs:
                per_case.append(all(v.passed for v in runs))
        pass_k = round(sum(per_case) / len(per_case) * 100) if per_case else None

    case_results = []
    for i, c in enumerate(cases[:100]):
        scores = {k: {"value": v.value, "pass": v.passed, "reason": v.reason} for (ci, k), v in results.items() if ci == i and not k.startswith("pass_k:")}
        case_results.append({"id": c.get("id", str(i + 1)), "query": c.get("query"), "response": (c.get("response") or "")[:600], "scores": scores})

    return {"metrics": metrics, "contentSafety": content_safety, "passK": pass_k, "cases": len(cases), "caseResults": case_results,
            "judgeCalls": len(jobs) - len(errors)}


def _ratio(hits: list[bool]) -> float | None:
    return sum(hits) / len(hits) if hits else None


def _deterministic(key: str, cases: list[dict[str, Any]]) -> float | None:
    if key == "key_fact_coverage":
        per = []
        for c in cases:
            facts = c.get("facts") or []
            if facts:
                resp = (c.get("response") or "").lower()
                per.append(sum(1 for f in facts if f.lower() in resp) / len(facts))
        return mean(per) if per else None
    if key == "retrieval_recall":
        per = []
        for c in cases:
            relevant = set(c.get("relevantIds") or [])
            if relevant:
                per.append(len(relevant & set((c.get("retrievedIds") or [])[:5])) / len(relevant))
        return mean(per) if per else None
    if key == "tool_accuracy":
        hits = []
        for c in cases:
            actual = [json.dumps(t, sort_keys=True) for t in c.get("toolCalls") or []]
            for e in c.get("expectedToolCalls") or []:
                hits.append(json.dumps(e, sort_keys=True) in actual)
        return _ratio(hits)
    if key == "trajectory_match":
        return _ratio([[t["name"] for t in c.get("toolCalls") or []] == [t["name"] for t in c["expectedToolCalls"]] for c in cases if "expectedToolCalls" in c])
    if key == "budget_breaches":
        r = _ratio([c["steps"] > c["stepBudget"] for c in cases if "steps" in c and "stepBudget" in c])
        return None if r is None else r * 100
    if key == "tool_selection":
        return _ratio([c["tool"] == c["expectedTool"] for c in cases if "expectedTool" in c])
    if key == "call_success":
        return _ratio([bool(c["ok"]) for c in cases if "ok" in c])
    if key == "contract_conformance":
        return _ratio([bool(c["conformant"]) for c in cases if "conformant" in c])
    if key == "definition_drift":
        r = _ratio([c["definitionHash"] != c["approvedHash"] for c in cases if "approvedHash" in c])
        return None if r is None else r * 100
    return None
