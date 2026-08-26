# One image for the whole app: the React bundle is built here and then served by
# FastAPI itself, so there is no separate web server and no CORS to configure.
# Build context is the repository root, because this needs both halves.

# ---- build the frontend -----------------------------------------------------
FROM node:22-alpine AS web

WORKDIR /web

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---- serve API and frontend together ----------------------------------------
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app

# The compiled SPA. app/main.py mounts this and falls back to index.html so
# react-router owns every path that is not /api.
COPY --from=web /web/dist ./static

# Non-root, so a compromised container cannot write to the image.
RUN useradd --system --create-home appuser && chown -R appuser /srv
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
