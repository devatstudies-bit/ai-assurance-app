import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import admin, applications, evaluations, findings, manual, models, scans
from .seed import init_db

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db(seed=settings.seed_on_startup)
    yield


app = FastAPI(
    title="AI Assurance API",
    version="1.0.0",
    description="Evaluation, red teaming, findings and the unified release gate (AI Evaluation and Red Teaming Framework v1.0).",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

for r in (applications, scans, evaluations, models, findings, manual, admin):
    app.include_router(r.router)


@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok"}
