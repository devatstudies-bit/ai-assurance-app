"""Model registry: judge LLMs (evaluation scoring) and attack models (red team scan engines)."""

import re
from typing import Any

from fastapi import APIRouter, HTTPException, status

from ..framework import ATTACK_PROVIDERS, JUDGE_PROVIDERS, PROVIDERS, Perm
from ..llm.client import ping, secret_configured
from ..models import EvaluationRun, ModelDeployment, RedTeamScan
from ..schemas import ModelCreate, ModelFields
from ..security import CurrentUser, require
from ..serialize import to_api
from ..util import now
from .common import Db, get_or_404

router = APIRouter(prefix="/api/models", tags=["Model registry"])

REQUIRED = {
    "azure-openai": ("endpoint", "deployment"),
    "openai-compatible": ("endpoint", "deployment"),
    "anthropic": ("deployment",),
    "azure-redteam-service": ("endpoint",),
    "simulated": (),
}


def model_out(m: ModelDeployment) -> dict[str, Any]:
    return {**to_api(m), "providerLabel": PROVIDERS[m.provider], "secretConfigured": secret_configured(m)}


def _validate(m: ModelDeployment) -> None:
    allowed = JUDGE_PROVIDERS if m.purpose == "judge" else ATTACK_PROVIDERS
    if m.provider not in allowed:
        raise HTTPException(422, f"{PROVIDERS[m.provider]} cannot be used as a {m.purpose} model")
    missing = [f for f in REQUIRED[m.provider] if not getattr(m, f)]
    if missing:
        raise HTTPException(422, f"{PROVIDERS[m.provider]} needs: {', '.join(missing)}")
    if m.provider in ("azure-openai", "anthropic") and m.auth != "entra" and not m.api_key_env:
        raise HTTPException(422, "Set the environment variable that holds the API key (keys are never stored)")
    if m.provider == "anthropic" and m.temperature is not None:
        raise HTTPException(422, "Leave temperature empty for Claude models; current Claude models reject sampling parameters")


@router.get("")
def list_models(db: Db, purpose: str | None = None):
    q = db.query(ModelDeployment)
    if purpose:
        q = q.filter(ModelDeployment.purpose == purpose)
    return [model_out(m) for m in q.order_by(ModelDeployment.purpose, ModelDeployment.is_default.desc(), ModelDeployment.name)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_model(body: ModelCreate, db: Db, user: CurrentUser):
    require(user, Perm.MANAGE_MODELS, "Judge and attack models are maintained by the AI platform team")
    base = f"{body.purpose}-" + re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")
    model_id, n = base[:56], 2
    while db.get(ModelDeployment, model_id):
        model_id, n = f"{base[:52]}-{n}", n + 1
    fields = body.model_dump(exclude_none=True)
    if body.calibration:
        fields["calibration"] = body.calibration.model_dump(by_alias=True)
    m = ModelDeployment(id=model_id, updated_at=now(), **fields)
    m.auth = m.auth or "api-key"
    m.dedicated = True if m.dedicated is None else m.dedicated
    m.enabled = True if m.enabled is None else m.enabled
    m.is_default = db.query(ModelDeployment).filter_by(purpose=body.purpose, is_default=True).count() == 0
    m.notes = m.notes or ""
    _validate(m)
    db.add(m)
    db.commit()
    return model_out(m)


@router.patch("/{model_id}")
def update_model(model_id: str, body: ModelFields, db: Db, user: CurrentUser):
    require(user, Perm.MANAGE_MODELS, "Judge and attack models are maintained by the AI platform team")
    m = get_or_404(db, ModelDeployment, model_id, "Model")
    for key, value in body.model_dump(exclude_unset=True).items():
        if key == "calibration" and body.calibration is not None:
            value = body.calibration.model_dump(by_alias=True)
        setattr(m, key, value)
    if m.is_default and not m.enabled:
        raise HTTPException(409, "Make another model the default before disabling this one")
    _validate(m)
    m.updated_at = now()
    db.commit()
    return model_out(m)


@router.post("/{model_id}/default")
def make_default(model_id: str, db: Db, user: CurrentUser):
    require(user, Perm.MANAGE_MODELS, "Judge and attack models are maintained by the AI platform team")
    m = get_or_404(db, ModelDeployment, model_id, "Model")
    if not m.enabled:
        raise HTTPException(409, "Enable the model before making it the default")
    for other in db.query(ModelDeployment).filter_by(purpose=m.purpose):
        other.is_default = other.id == m.id
    db.commit()
    return model_out(m)


@router.post("/{model_id}/test")
def test_model(model_id: str, db: Db, user: CurrentUser):
    """Makes one small call to check endpoint, deployment and credentials."""
    require(user, Perm.MANAGE_MODELS, "Judge and attack models are maintained by the AI platform team")
    return ping(get_or_404(db, ModelDeployment, model_id, "Model"))


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(model_id: str, db: Db, user: CurrentUser):
    require(user, Perm.MANAGE_MODELS, "Judge and attack models are maintained by the AI platform team")
    m = get_or_404(db, ModelDeployment, model_id, "Model")
    used = db.query(EvaluationRun).filter_by(judge_model_id=m.id).count() + db.query(RedTeamScan).filter_by(attack_model_id=m.id).count()
    if used:
        raise HTTPException(409, f"{m.name} scored or ran {used} recorded runs; disable it instead so evidence keeps its provenance")
    if m.is_default:
        raise HTTPException(409, "Make another model the default before deleting this one")
    db.delete(m)
    db.commit()
