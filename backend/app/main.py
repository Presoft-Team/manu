from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import job_sheets, wip, work_orders


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        # Development convenience. Replace with `alembic upgrade head` for real deployments.
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Job Control API",
    version="0.1.0",
    summary="Job sheets, work orders and shop floor WIP.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(job_sheets.router, prefix="/api")
app.include_router(work_orders.router, prefix="/api")
app.include_router(wip.router, prefix="/api")


@app.get("/api/health", tags=["ops"])
def health() -> dict[str, str]:
    return {"status": "ok"}
