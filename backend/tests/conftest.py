import os
import tempfile

import pytest

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["ASSURANCE_DATABASE_URL"] = f"sqlite:///{_db.name}"
os.environ["ASSURANCE_SIMULATED_SCAN_SECONDS"] = "0"
os.environ["ASSURANCE_SIMULATED_EVAL_SECONDS"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import reset_db  # noqa: E402
from app.services import scans  # noqa: E402


@pytest.fixture()
def client(monkeypatch):
    reset_db()
    # Run scans inline so tests see the finished result
    monkeypatch.setattr(scans, "launch", lambda scan_id, background=True: scans.run_scan(scan_id))
    with TestClient(app) as c:
        yield c


def as_role(role: str) -> dict[str, str]:
    return {"X-Role": role}
