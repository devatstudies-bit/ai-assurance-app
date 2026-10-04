from fastapi import APIRouter, HTTPException, status

from ..framework import Perm
from ..models import Application, EvaluationRun, LibraryItem, ModelDeployment
from ..schemas import EvaluationCreate
from ..security import CurrentUser, require
from ..serialize import to_api
from ..services import evaluations as svc
from .common import Db, get_or_404

router = APIRouter(prefix="/api/evaluations", tags=["Evaluations"])


@router.get("")
def list_evaluations(db: Db, app: str | None = None):
    q = db.query(EvaluationRun)
    if app:
        q = q.filter(EvaluationRun.app_id == app)
    return [to_api(r) for r in q.order_by(EvaluationRun.started_at.desc())]


@router.get("/{run_id}")
def get_evaluation(run_id: str, db: Db):
    return to_api(get_or_404(db, EvaluationRun, run_id, "Evaluation run"))


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def start_evaluation(body: EvaluationCreate, db: Db, user: CurrentUser):
    """Scores the app's golden dataset with the selected judge. Poll GET /api/evaluations/{id} for progress."""
    require(user, Perm.RUN_SCANS)
    app = get_or_404(db, Application, body.app_id, "Application")
    if body.judge_model_id:
        judge = get_or_404(db, ModelDeployment, body.judge_model_id, "Model")
    else:
        judge = db.query(ModelDeployment).filter_by(purpose="judge", is_default=True).first()
        if judge is None:
            raise HTTPException(409, "No default judge model is configured")
    if judge.purpose != "judge":
        raise HTTPException(422, f"{judge.name} is an attack model, not a judge")
    if not judge.enabled:
        raise HTTPException(409, f"{judge.name} is disabled")

    dataset = db.get(LibraryItem, body.dataset_id) if body.dataset_id else svc.default_dataset(db, app.id)
    if body.dataset_id and (dataset is None or dataset.app_id != app.id or dataset.kind not in svc.DATASET_KINDS):
        raise HTTPException(422, "Choose a golden dataset or agent scenario set registered for this application")
    if dataset is None and judge.provider != "simulated":
        raise HTTPException(409, f"{app.name} has no golden dataset in the test library")

    run = svc.start_evaluation(db, app, judge, dataset, body.mode)
    db.commit()
    svc.launch(run.id)
    return to_api(run)
