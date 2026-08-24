# Job Control

Manufacturing job sheet and shop floor prototype built from [flowchart.md](flowchart.md).

The frontend is a hardcoded React prototype: it runs entirely off
[frontend/src/data/seed.ts](frontend/src/data/seed.ts) with no network calls. The backend is a
FastAPI and Postgres service whose tables and endpoints already match the frontend's types, so
wiring the two together later is a fetch layer change rather than a rewrite.

## What the prototype covers

| Screen | Route | What it does |
| --- | --- | --- |
| Draft job sheets | `/` | Demand from sales orders, forecast and rework, waiting to be split |
| Job sheet editor | `/job-sheets/:id` | Goal quantities, work order tabs, save draft, confirm |
| Confirmed job sheets | `/confirmed` | Locked sheets by status, with approve and return |
| Work in progress | `/wip` and `/wip/:workOrderId` | Released orders, staff WIP, done / rosak / waste |

### The rules the UI actually enforces

- Each work order opens as its own browser-style tab inside the job sheet. Draft tabs can be
  closed, confirmed ones cannot.
- Adding a work order asks for AI or manual first. AI pulls a BOM and route from the matching part
  family and books a machine slot; when no history exists it says so and drops you onto the manual
  path, exactly like the database audit branch in the flowchart.
- Confirming a work order needs a BOM, a route, a passed stock feasibility check, a calculated
  summary and a machine slot. After that the work order is read only.
- Confirming the job sheet needs every work order confirmed. After that the whole sheet is read
  only and moves to the confirmed page.
- A stock shortage raises a purchase request and flags the project manager rather than blocking
  silently.

## Running the frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

`npm run build` produces a static bundle, `npm run typecheck` runs the compiler alone.

> On npm 11, `esbuild`'s postinstall script is blocked by default. The build works regardless; run
> `npm approve-scripts` if you want to clear the warning.

## Running everything in Docker

```bash
docker compose up --build
```

| Service | Port | Notes |
| --- | --- | --- |
| `web` | 8080 | Static build behind nginx, proxies `/api` to the API so there is no CORS |
| `api` | 8000 | FastAPI, docs at http://localhost:8000/docs |
| `db` | 5432 | Postgres 17, data in the `pgdata` volume |

The API seeds the material master and a small slice of the flow on first boot. The seed is a no-op
once data exists.

## Running the backend alone

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate     # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env                                # point DATABASE_URL at your Postgres
python -m app.seed
uvicorn app.main:app --reload
```

## Layout

```
frontend/src/
  types.ts              domain model, mirrored by backend/app/models.py
  data/seed.ts          all hardcoded data
  store/mes.tsx         in-memory store: locking, feasibility, costing, scheduling
  components/           shell, tabs, work order editor, shared UI
  pages/                the four screens
backend/app/
  models.py             SQLAlchemy tables
  schemas.py            Pydantic, serialised camelCase to match types.ts
  services.py           costing, feasibility, AI assign, serialisation
  routers/              job_sheets, work_orders, wip
```

## Design decisions

Dense internal tooling, not a marketing surface: one accent colour reserved for actions, status
colours used only for real state, mono tabular numerals everywhere a number appears, hairline
separators instead of nested cards, and a single locked theme that follows the operating system
with a manual override.

## Not built yet

Warehouse pick lists and material dispatch, the operator terminal itself, quality audit and the
rework loop, component lifecycle limits, and actual cost rollup at FGTN. The flowchart covers
these; the prototype stops at the WIP readout.
