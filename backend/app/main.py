from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, engine
from app.routers import job_sheets, wip, work_orders

# The compiled React app, copied here by the Dockerfile. Absent when the backend
# runs on its own during development, in which case nothing below mounts and the
# Vite dev server serves the UI instead.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


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


# ---- frontend ---------------------------------------------------------------
# Registered last, so /api, /docs and /openapi.json are matched first.
if STATIC_DIR.is_dir():
    assets = STATIC_DIR / "assets"
    if assets.is_dir():
        # Vite fingerprints these filenames, so they can be cached hard.
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        """Serve a real file when there is one, otherwise hand back the shell.

        React Router owns every remaining path, so /job-sheets/js-1 has to load
        index.html rather than 404 when someone refreshes on it.
        """
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        candidate = (STATIC_DIR / full_path).resolve()
        # Never serve outside the static root, whatever the path contains.
        if full_path and candidate.is_file() and candidate.is_relative_to(STATIC_DIR):
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
