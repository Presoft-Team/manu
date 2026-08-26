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

## The screens

| Screen | Route | What it does |
| --- | --- | --- |
| Dashboard | `/` | Live plant state: KPIs, the alert feed, delivery risk, machine load, floor progress |
| Job sheets | `/job-sheets` | Every sheet at every status: status strip, search, filters, sort, paging |
| Job sheet layer | `/job-sheets/:id` | Opens **over** the list, tabbed: the sheet plus one tab per work order |
| Approvals | `/confirmed` | Locked sheets by status. A row expands into the full sheet, and approves in place |
| Work in progress | `/wip`, `/wip/:workOrderId` | Released orders, staff WIP, done / rosak / waste, floor mode |
| Quality | `/quality` | QC verdicts, rework and scrap, actual cost against planned |
| Master data | `/master-data` | Products, materials, BOMs, routes, machines, employees, work centres |

---

# How to use it

The system follows one loop: **demand comes in → it is planned → someone approves it → the floor
runs it → quality signs it off.** Each step below is a screen, in the order you would actually
touch them.

## 1. Get demand in — Job sheets

Two buttons, top right of `/job-sheets`:

- **Upload job sheet** parses a customer file in the browser (CSV, TSV or JSON, up to 2 MB) and
  drops the result into the same review form as manual entry, because an uploaded file is never
  trusted straight into a job sheet. Column names are matched loosely, so `qty`, `quantity` and
  `target_qty` all work, as do `;` and tab delimiters and `DD/MM/YYYY` dates. Anything unreadable
  becomes a visible warning rather than a silent drop.
- **Input job sheet** is the same form, typed by hand.

```csv
customer, Kenyalang Autoparts Sdn Bhd
reference, SO-88274
due, 2026-09-08
product_code, product_name, qty, unit
FG-BRKT-220, Mounting bracket anthracite, 2400, pcs
```

Either way you get a **draft** sheet carrying one or more goals — a product and a quantity to hit.

## 2. Plan it — the job sheet layer

Click a sheet code to open it. The layer sits over the list, so you never lose the queue. It is
tabbed: the sheet itself, then one tab per work order.

**The fast path is the lightbulb.** *Auto-plan with AI* on the sheet tab does the whole thing in
one click: it splits every uncovered goal remainder into work orders, assigns a BOM and a route by
part family, checks stock, costs each order and books a machine slot. Where no history exists for a
product it tells you so and leaves that one for manual entry.

**The manual path** is the `+` on the tab bar. Add a work order, then on its tab:

1. Pick a **BOM** and a **route** from the library dropdowns. Edit lines and steps if you need to.
2. **Check stock.** Short lines flag red and raise a purchase request against the project manager.
   Each short line offers both exits: edit the quantity down, or raise a PO.
3. **Calculate** the production summary — material, labour, overhead, expected output, run hours.
4. **Book a slot.** *Find earliest window* asks the scheduler for the first free window on the
   route's machine.

> The machine slot stays locked until both a BOM and a route are chosen. There is no useful way to
> schedule work whose duration is not yet known.

### Rescheduling: drag the bar

Under the slot is the whole plant's schedule — every machine against one time axis. Your order's
bar is the filled one. **Drag it:**

- **Sideways** moves it in time, snapped to the half hour.
- **Onto another row** moves it to that machine.
- **Arrow keys** do the same from the keyboard once the bar has focus: left/right an hour, up/down
  a machine.

Nothing is written until you let go, and a drop that would double-book a machine is refused by
name. A slot you moved by hand is marked *planner booked* rather than *auto-scheduled*.

### There is no Save button

Every edit is written as you make it. The footer reports **All changes saved** and the time of the
last change instead of asking you to press anything.

## 3. Confirm it

**Confirm job sheet** on the sheet tab moves the sheet to *pending approval* and confirms every
work order on it at once. Work orders are never confirmed individually — the sheet is the unit of
commitment.

It is blocked only when an order genuinely cannot be built: no BOM, no route, no machine slot, or a
material line short on stock. The message names the offending order.

Once confirmed, **the sheet and every work order on it are read-only.**

## 4. Approve it — Approvals

`/confirmed` is the production manager's queue. Click any row and the whole sheet opens underneath
it — you approve without leaving the queue:

- planned cost, total run hours, whether stock is covered, and how much of it the AI built
- each goal and whether it is fully covered
- every work order: BOM lines, route steps, run hours, expected output, the booked machine window,
  cost, and any open purchase requests

Then either:

- **Approve** — soft-reserves the stock and releases every work order to the floor.
- **Return** — sends the sheet back to draft so the planner can edit it again.

## 5. Run it — Work in progress

`/wip` lists everything released. Open one to see the staff WIP: who ran each operation, on which
shift and machine, and the good, **rosak** (defective) and waste quantities they recorded, plus
downtime and its reason.

**Floor mode** (top right) is for the tablet next to the machine: bigger type, 48px touch targets,
and forced dark to cut glare in a dim bay.

## 6. Sign it off — Quality

`/quality` lists every work order the floor has actually produced against. Each card gives you:

- **Verification** — ordered against produced, good, rosak, waste, downtime, and the shortfall
  against the order
- **Actual cost** — material on everything consumed (good, defective and wasted alike), labour on
  hours actually clocked, overhead, and the variance against what was planned at confirmation. The
  whole cost is carried by the good units, so the cost per good unit tells the truth.

Then one of three verdicts:

| Verdict | What happens |
| --- | --- |
| **Accept** | Good units released to stock, the order closes |
| **Rework** | Raises a **child job sheet** for the defective units, linked back to this work order |
| **Scrap** | Writes the units off; their cost stays on this order |

A rework sheet lands back in `/job-sheets` as a draft, and the loop starts again.

## 7. Watch it — Dashboard

`/` is the landing screen. Nothing on it is entered by hand; every figure is derived from the job
sheets, work orders and operator runs, and it re-derives itself every 30 seconds.

- **KPIs** — open sheets, orders on the floor, operators clocked in, good units, yield, availability
- **Alerts**, in severity order, each one clickable straight to the thing that needs doing:
  stopped lines and operators waiting on a supervisor (critical), material shortages netted across
  the whole plan, overdue sheets, yield under the 95% target (warning), sheets awaiting approval and
  half-built drafts (info)
- **Delivery risk**, **machine load**, and per-order **floor progress**

Alerts are derived, never stored — one disappears the moment the condition behind it clears, which
is the only way a feed stays trustworthy.

## Reference — Master data

`/master-data` is what planning matches against: products and their standard BOM and route,
material stock and cover against the current plan, the BOM and route libraries, machines and their
load, operators and their yield, and work centres. Read-only in this build; search filters whichever
table you are on.

---

## Rules the UI enforces

- **The sheet is confirmed, not the individual work orders.**
- **The lightbulb lives on the job sheet, not on each work order.** Where no history exists it says
  so and leaves that product for manual entry, exactly like the database audit branch in the
  flowchart.
- **A work order's machine slot stays locked until both a BOM and a route are selected.**
- **One machine, one order at a time.** Dragging a slot onto an occupied window is refused, as is
  scheduling into the past.
- **A stock shortage raises a purchase request** and flags the project manager rather than blocking
  silently.
- **Confirmed and in-progress work orders are read only.** An order on the floor offers a single
  "View work in progress" button instead of controls.
- **A QC verdict cannot be overwritten.** Inspect once; the record is the record.

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

**Reset data** in the header restores the seed at any time, which is the fastest way to get back to
a known state after clicking through the flow.

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
  store/mes.tsx         in-memory store: locking, AI planning, feasibility, costing, scheduling, QC
  lib/
    rates.ts              labour, overhead, scrap and yield-target constants, shared by both engines
    analytics.ts          every derived figure: rollups, actual cost, material demand, machine
                          load, the alert builder, plant KPIs
    parseJobSheet.ts      CSV / TSV / JSON reader for uploaded job sheets
    format.ts             number, money, date and elapsed-time formatting
  components/
    Shell.tsx             header, nav, theme toggle, flash messages
    JobSheetOverlay.tsx   the job sheet layer and its tab bar
    WorkOrderTab.tsx      one work order: goal, BOM, route, materials, slot
    MachineSchedule.tsx   the drag-to-reschedule strip, every machine on one axis
    NewJobSheetDialog.tsx upload or type a new sheet
    ui.tsx                buttons, panels, badges, metrics, tabs, fields
  pages/
    Dashboard.tsx         KPIs, alerts, delivery risk, machine load, floor progress
    JobSheets.tsx         the sheet list
    ConfirmedJobSheets.tsx approvals queue with the inline sheet review
    WipWorkOrders.tsx     floor readout and staff WIP
    Quality.tsx           QC verdicts and actual costing
    MasterData.tsx        the seven reference tables
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
planner keeps the queue in view and never navigates away from it. Approvals takes the same position
differently: the sheet expands inside the row, because approving is a reading job and losing the
queue costs more than the space.

Derived over stored, everywhere it is a choice. Alerts, yields, actual costs and net material
requirements are all computed from the same three arrays, so no two screens can disagree.

## Not built yet

The frontend to backend wiring described at the top. Master data is read-only — the tables are the
seeded records, and creating or editing them lands with the backend. Beyond that: warehouse pick
lists and material dispatch, the operator terminal itself, component lifecycle limits, and the FGTN
handoff. The flowchart covers these.
