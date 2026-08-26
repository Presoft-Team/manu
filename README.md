# PrePPSE

Manufacturing job sheet and shop floor prototype built from [flowchart.md](flowchart.md).

One command hosts the whole thing:

```bash
docker compose up --build          # http://localhost:8080
```

That builds the React bundle, bakes it into the Python image, starts Postgres, seeds it and
serves the UI and the API from a single container on one origin.

> **The UI does not call the API yet.** Every screen runs off
> [frontend/src/data/seed.ts](frontend/src/data/seed.ts) held in React state, so edits reset on
> reload while Postgres sits there fully populated with the same shape of data. The backend is
> real and complete; wiring [frontend/src/store/mes.tsx](frontend/src/store/mes.tsx) to `/api` is
> the outstanding work, and it is a fetch layer change rather than a rewrite.

## What the prototype covers

| Screen | Route | What it does |
| --- | --- | --- |
| Job sheets | `/` | Every sheet at every status: card rail, search, filters, sort, paging |
| Job sheet layer | `/job-sheets/:id` | Opens **over** the list, tabbed: the sheet plus one tab per work order |
| Approvals | `/confirmed` | Locked sheets by status, with approve and return |
| Work in progress | `/wip` and `/wip/:workOrderId` | Released orders, staff WIP, done / rosak / waste |

Expanding a row in the job sheet list shows that sheet's work orders. Clicking one that is already
on the floor jumps straight to its WIP screen; anything else opens the sheet layer on that work
order's tab.

### The rules the UI actually enforces

- **The sheet is confirmed, not the individual work orders.** Confirming the job sheet moves it to
  pending and confirms every work order on it at once. It is blocked only when an order genuinely
  cannot be built: no BOM, no route, no machine slot, or a material line short on stock.
- **The lightbulb lives on the job sheet, not on each work order.** One click splits every
  uncovered goal remainder into work orders, assigns a BOM and route by part family, checks stock,
  costs the order and books a machine slot. Where no history exists it says so and leaves that
  product for manual entry, exactly like the database audit branch in the flowchart.
- **A work order's machine slot stays locked until both a BOM and a route are selected.**
- **A stock shortage raises a purchase request** and flags the project manager rather than blocking
  silently. The short line offers both exits: edit the quantity, or raise a PO.
- **Confirmed and in-progress work orders are read only.** Their Delete and Save controls
  disappear; an order on the floor offers a single "View work in progress" button instead.

### Getting demand in

The job sheet page has **Upload job sheet** and **Input job sheet**. Upload parses a customer file
in the browser (CSV, TSV or JSON, up to 2 MB) and drops the result into the same review form as
manual entry, because an uploaded file is never trusted straight into a job sheet. Column names are
matched loosely, so `qty`, `quantity` and `target_qty` all work, as do `;` and tab delimiters and
`DD/MM/YYYY` dates. Anything unreadable becomes a visible warning rather than a silent drop.

```csv
customer, Kenyalang Autoparts Sdn Bhd
reference, SO-88274
due, 2026-09-08
product_code, product_name, qty, unit
FG-BRKT-220, Mounting bracket anthracite, 2400, pcs
```

## Docker

```bash
docker compose up --build          # build and run, streams logs
docker compose up -d               # same, detached
docker compose down                # stop, keep the database
docker compose down -v             # stop and wipe the database
```

| Service | Host port | Notes |
| --- | --- | --- |
| `app` | 8080 | FastAPI serving both `/api` and the compiled React app. Docs at http://localhost:8080/docs |
| `db` | 5433 | Postgres 17, data in the `pgdata` volume |

There is no separate web server. [main.py](backend/app/main.py) mounts `/assets` and falls back to
`index.html` for any path that is not a real file, so React Router owns the URLs and refreshing on
`/job-sheets/js-1` works. Requests under `/api` are matched first and still return JSON 404s.

Postgres publishes on **5433**, not 5432, because a second Postgres is usually already running on a
development machine. Override with `POSTGRES_PORT` if you want. It is published only so a GUI
client can reach it; the app container talks to `db:5432` over the internal network.

The API seeds the material master and a slice of the flow on first boot. The seed is a no-op once
data exists.

## Working on the frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, hot reload
npm run build        # static bundle into dist/
npm run typecheck    # compiler alone
```

The dev server is the fast loop; Docker is for running the whole stack. `CORS_ORIGINS` in
[docker-compose.yml](docker-compose.yml) already allows `localhost:5173`, so a dev-server frontend
can call the containerised API once the two are wired together.

> Two local-machine notes. On npm 11 `esbuild`'s postinstall is blocked by default; the build works
> regardless, run `npm approve-scripts` to clear the warning. And VS Code must use the workspace
> TypeScript (5.9) or it misreports `ts(7016)` on `@phosphor-icons/react`, which
> [.vscode/settings.json](.vscode/settings.json) pins for you.

## Running the backend alone

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate     # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env                                # point DATABASE_URL at your Postgres
python -m app.seed
uvicorn app.main:app --reload
```

With no `static/` directory present the app serves the API only, which is what you want here.

## Layout

```
Dockerfile              one image: node builds the SPA, python serves it with the API
docker-compose.yml      app + db
frontend/src/
  types.ts              domain model, mirrored by backend/app/models.py
  data/seed.ts          all hardcoded data, plus the BOM and route libraries
  store/mes.tsx         in-memory store: locking, AI planning, feasibility, costing, scheduling
  lib/parseJobSheet.ts  CSV / TSV / JSON reader for uploaded job sheets
  components/
    Shell.tsx             header, nav, theme toggle, flash messages
    JobSheetOverlay.tsx   the job sheet layer and its tab bar
    WorkOrderTab.tsx      one work order: goal, BOM, route, materials, slot
    NewJobSheetDialog.tsx upload or type a new sheet
    ui.tsx                buttons, panels, badges, fields
  pages/                job sheets list, approvals, work in progress
backend/app/
  main.py               API routers plus the SPA fallback
  models.py             SQLAlchemy tables
  schemas.py            Pydantic, serialised camelCase to match types.ts
  services.py           costing, feasibility, AI assign, serialisation
  routers/              job_sheets, work_orders, wip
```

## Design decisions

Dense internal tooling, not a marketing surface: one accent colour, apple green, reserved for
actions; status colours used only for real state; mono tabular numerals everywhere a number
appears; hairline separators instead of nested cards; and a single locked theme that follows the
operating system with a manual override.

The job sheet detail is a layer over the list rather than its own page, behind an 80% scrim, so the
planner keeps the queue in view and never navigates away from it.

## Not built yet

The frontend to backend wiring described at the top. Beyond that: warehouse pick lists and material
dispatch, the operator terminal itself, quality audit and the rework loop, component lifecycle
limits, and actual cost rollup at FGTN. The flowchart covers these; the prototype stops at the WIP
readout.
