# PrePPSE — design review brief

A manufacturing execution prototype: turns customer demand into work orders, gets them approved,
and tracks them on the shop floor. Internal tooling for a factory office, not a marketing surface.

Everything below is **built and working**. I am looking for design recommendations. Stack is
React 19 + TypeScript + Tailwind v4, served with FastAPI and Postgres from one Docker container.

---

## 1. Who uses it

| Role | What they do here | Where |
| --- | --- | --- |
| **Planner** | Takes a customer order, splits it into work orders, picks BOM and route, checks stock, books machines | Job sheets + the sheet layer |
| **Production manager** | Approves or returns a finished job sheet | Approvals |
| **Supervisor** | Watches what is running, reads yield and downtime | Work in progress |
| **Operator** | Taps start/finish at a shop floor terminal | **Not built yet** |

The planner is the primary user and does the most work per session.

---

## 2. The objects and their states

- **Job sheet** — one customer order or forecast run. Client, reference, due date, and one or more
  **goals** (an item + a target quantity).
- **Work order** — one batch against one goal. A goal of 2,400 might split into two orders of 1,200.
  Carries a **BOM** (materials), a **route** (machine operations), a **machine slot**, a cost summary.
- **Staff run** — one operator's turn on a work order: good units, scrap ("rosak"), waste, downtime.

```
Job sheet:   draft → pending approval → approved → in progress → completed
                          ↘ rejected (back to draft, with a reason)

Work order:  draft → confirmed → released → running → stopped → completed
```

Work orders are never confirmed one at a time — confirming the job sheet confirms all of them.
A draft work order short on materials displays as **"Pending PO"**.

---

## 3. Global chrome — on every screen

**Header** (sticky, translucent with blur, hairline bottom border):
- Gear icon in accent + wordmark "PrePPSE"
- Nav: `Job sheets` · `Approvals` · `Work in progress` — active item is a soft-accent pill with
  accent text; inactive is dim text with a panel hover
- Right side: `Reset data` ghost button (clockwise-arrow icon), and a theme toggle (sun/moon icon)

**Flash toast** — fixed, bottom centre, max 62 characters wide, hairline border, dismiss `X`,
auto-clears after 5.2s. Every action reports through this: what the AI planner did, why a confirm
was refused, that a PO was raised.

**Page container** — max width 1500px, 16px gutters.

---

## 4. Shared components used everywhere

| Component | Variants / parts |
| --- | --- |
| **Button** | `primary` (solid accent), `secondary` (bordered), `ghost` (text only), `danger` (red outline). Optional leading icon. Disabled = 40% opacity. Presses down 1px. |
| **Panel** | Bordered container, 6px radius. Optional 40px header: uppercase 12px title + right-side action slot. |
| **Badge** | 4px radius, hairline border, tinted background, 11px. Three kinds: job sheet status, work order status, run status. |
| **Metric** | Small dim label, large mono value, optional hint line, optional colour tone. Used in 4- and 5-across grids. |
| **Field** | 11px label, control, optional hint. |
| **Input / select** | 6px radius, `line-strong` border, accent border on focus, dimmed when disabled. |
| **EmptyState** | Large light-weight icon, title, body copy, optional action button. |

---

## 5. Screen: Job sheets — `/` — the home screen

### 5.1 Header row
- `h1` "Job sheets" + one-line description
- Sheet count pill: mono number in accent + "sheets"
- `Input job sheet` button (keyboard icon)
- `Upload job sheet` button, primary (file-upload icon)

### 5.2 Card rail
Horizontally scrolling, snap points, up to 8 cards, 248px each. Unfinished sheets, soonest due
first. Each card contains:
- Sheet code (mono, medium)
- Lightbulb icon if any work order was AI-built
- Warning-octagon icon if any material is short
- Arrow that nudges right on hover
- Client name
- Item names, joined with " / "
- Progress bar — work orders confirmed over total
- "3/4 WO · 2,400 pcs" (mono)
- Days until due — red under 7 days, "12d over" when late
- Job sheet status badge

### 5.3 Toolbar
- Search input with magnifying-glass icon, placeholder "Order ID, client, item" — matches order id,
  client, reference and item name
- Six status chips: `All` `Draft` `Pending` `Confirmed` `In progress` `Completed` — active chip is
  accent border + soft-accent fill
- Sort dropdown: Last modified · Created · Due date · Client · Order ID
- Ascending/descending toggle (up-down-arrows icon, reads "Desc"/"Asc")

### 5.4 Table
Column header row (hidden on narrow screens): *(chevron)* · Order ID · Client · Created ·
Last modified · Status

Each row:
| Element | Detail |
| --- | --- |
| Expand chevron | Rotates 180° when open |
| Order ID | Mono code, hover turns accent; beneath it the source ("Sales order") + reference |
| Client | Client name; beneath it the item names |
| Created | Date; beneath it who raised it |
| Last modified | Date + time; label beneath |
| Status | Warning-octagon icon if short on stock, then the status badge |

Open row background is a soft accent wash.

### 5.5 Expanded work order list
Indented, left accent rail 2px, tinted background. One line per work order:
- Work order code (mono)
- Item name + quantity
- Lightbulb icon if AI-assigned
- Status pill: `Work in progress` / `Completed` / `Confirmed` / `Pending PO` / `Draft`
- Right-hand hint: "Open WIP →" for anything on the floor, otherwise "Edit in sheet"

If the sheet has none: "No work orders yet. Open JS-… to split its goals into work orders."

### 5.6 Footer
`Rows per page` select (10 / 25 / 50) · "1–10 of 24" (mono) · previous/next icon buttons, disabled
at the ends.

### 5.7 Empty state
File-dashed icon, "No job sheets match", with guidance to clear the search or pick another status.

---

## 6. Screen: the job sheet layer — `/job-sheets/:id`

**This is the piece I most want an opinion on.** The job sheet detail is *not* a separate page. It
opens as a layer **over** the list, which stays visible behind an **80% scrim** with a 2px blur, so
the planner keeps the queue in view. Closes on Esc, backdrop click, or the X. Panel is max 1180px
wide, 6px radius with a square top-left corner, heavy shadow. Page scroll locks behind it.

### 6.1 Tab bar — sits on the panel's top edge, like browser tabs
- Tab 1: small "JobSheet" label + mono sheet code
- Then one tab per work order: lightbulb icon if AI-built, "WorkOrder" label + mono code
- Inactive tabs are tinted by status — neutral for draft, green for confirmed, amber for on the floor
- `+` button (adds a work order)
- `X` close button, pushed to the far right, turns red on hover
- The active tab merges into the panel below it

### 6.2 Tab 1 — the job sheet

**Left column**
- Sheet code (mono, 19px) + status badge
- Client / reference / "raised by Amirah Kamal on 21 Aug 2026"
- Red banner if returned: "Returned by the production manager: …"
- **"Goal"** section heading (uppercase)
- Goal table:
  - **Item name** — product code (mono, faint) above the product name
  - **Qty** — target quantity + unit
  - **Still need** — target minus what work orders cover, coloured: amber if uncovered, red if
    over-produced, green if exact; with the label "not covered" / "over-produced" / "fully covered"
- Footnote: "2 work orders on this sheet. **Add one by hand** or let the planner fill the sheet."

**Right column**
- Card titled **"Confirm JobSheet"** containing:
  - The **lightbulb button** — full width, dashed accent border, 30px filled lightbulb, label
    "Auto-plan with AI", sub-label "Work orders, BOM, route and machine slots for the whole sheet."
    Scales slightly on hover.
  - `Confirm job sheet` primary button (check-circle icon)
  - Helper text: "Confirming moves the sheet to pending and confirms every work order on it."
- Card titled **"Due date"** — calendar icon + the date (mono)
- Green locked banner with padlock when the sheet is confirmed

**Footer** — single centred `Save` button (floppy icon), 200px min width.

> **The lightbulb is the signature interaction.** One click plans the entire sheet: splits every
> uncovered goal remainder into work orders, assigns BOM and route by matching part family, checks
> every material against stock, calculates cost and run time, books machine slots. It reports back
> what it created, what came up short, and any product it had no history for.

### 6.3 Tabs 2..n — one work order each

**Header strip** — mono code (17px) · status badge · mode chip ("AI assigned" with lightbulb, or
"Manual" with a pointing hand) · right side shows a padlock + "Locked by JS-…" when read-only.

**Three-column row**
1. **Goal** — product code (mono, faint), product name, `Qty` number input + unit, helper text
   "Drives BOM quantities and route run time."
2. **BOM** — dropdown, default option "Select an item", options grouped into *Matches this product*
   and *All*. Footnote below: "3 material lines, RM 8,783.16" or "No bill of materials selected yet."
3. **ROUTE** — same pattern. Footnote: the operations joined with arrows, e.g.
   "Blank and pierce → Powder coat".

**Material table** — section heading "Material", plus a red counter "2 lines short on stock".
| Column | Content |
| --- | --- |
| Material id | Mono code + lightbulb if AI-assigned |
| Name | Material description |
| Qty | Required quantity + unit, red when short |
| Qty in hand | Stock on hand + unit |
| Status | `In stock` (green) · `PO raised` (amber, receipt icon) · **`Not enough`** (red button) |

Short rows get a faint red row wash. Empty state: "Select a BOM above to load its material lines."

**Machine slot** — heading + `Book slot` / `Reschedule` button (calendar-check icon). Three states:
- Not ready: dashed panel, padlock, "Available only after a BOM and a route are selected."
- Booked: machine name (mono), start → end datetime, "Auto-scheduled, earliest free window"
- Ready but unbooked: "No slot booked yet on CNC-04 / Okuma LB3000."

**Cost strip** — four metrics: Expected output (with scrap allowance) · Run time · Material cost ·
Total cost (with labour beneath).

**Footer** — three mutually exclusive states:
- Draft: `Delete` (danger, trash icon) + `Save` (floppy), centred
- Confirmed: padlock + "Confirmed with the job sheet. This work order is read only."
- On the floor: single primary `View work in progress` button

---

## 7. Dialogs

### 7.1 Shortage popup — opened by the red `Not enough` button
- Header: warning octagon + "Not enough RM-MS-CR2", close X
- Sentence stating required vs on hand vs the shortfall, each figure in mono
- Card **"Edit the quantity"** — per-unit number input, live computed total, and a shortcut link
  "Use 0.148 per unit, the most stock covers"
- Card **"Or raise a purchase order"** — explains the PR alerts the project manager and the order
  stays in draft until stock lands
- Footer: `Cancel` · `Raise PO` (receipt icon) · `Save quantity` (primary, disabled until changed)

### 7.2 New job sheet — from the two header buttons
- Header "New job sheet" + X
- Two mode tabs: `Upload job sheet` (file-upload icon) · `Input job sheet` (keyboard icon)
- **Upload tab**: dashed dropzone with a 30px file icon, "Drop a customer order here, or click to
  browse", "CSV, TSV or JSON, up to 2 MB". Highlights on drag. Error banner for oversized files.
  Below it an "Expected format" card with prose and a mono code sample.
- **Input tab** (also where an upload lands, pre-filled):
  - Accent banner "Read from SO-88274.csv. Check it before creating the sheet."
  - Amber warnings list for anything the parser could not read
  - Fields: `Client` · `Source` (Sales order / Forecast / Rework) · `Reference` · `Due date`
  - "Goal" heading + `Add item` button
  - Editable goal table: Item id · Item name · Qty · Unit · trash icon per row
  - Red validation banner: "Still needs a client, a due date."
- Footer: "2 items ready" counter · `Cancel` · `Choose file` or `Create job sheet`

### 7.3 Add work order — from the `+` tab
- Two large choice cards side by side: **AI assign** (lightbulb) and **Manual** (pointing hand), each
  with a description of what that path does
- `Target goal` select showing remaining quantity per goal
- `Order quantity` number input + "pcs of 600 remaining"
- Amber banner if the quantity exceeds what the goal still needs
- Footer: `Cancel` · `Create work order`

---

## 8. Screen: Approvals — `/confirmed`

- `h1` + description
- Metric strip: Pending approval · Approved · In progress · Completed
- Five filter chips: All · Pending approval · Approved · In progress · Completed
- Panel "Sheets (n)", one row per sheet: code + reference · client + item names · target qty ·
  work order count · due date · then **either** `Return` (danger, u-turn icon) + `Approve` (primary,
  check-circle) **or** a status badge
- Empty state: seal-check icon, "Nothing at this status"

---

## 9. Screen: Work in progress — `/wip` and `/wip/:workOrderId`

### 9.1 Top metrics
Orders on the floor · Operators clocked in · Good units today (green) · Rosak units (red when
non-zero, with "1,240 waste, 95 min downtime" beneath)

### 9.2 Work order list
One row each: work order code + parent sheet code · current operation + machine · "1,180 / 1,800
pcs" with a progress bar (green, or red when stopped) · rosak count · operator count · status badge
· arrow that rotates 90° when the row is the selected one. Selected row gets an accent wash.

Empty state: factory icon, "Nothing on the floor".

### 9.3 Selected work order — staff WIP
- Heading: code + "staff WIP", with sheet code and machine on the right
- Five metrics: Quantity done (green) · Rosak (red) · Waste · Yield % (amber under 95%) · Downtime
- **Operator runs** table: Operator (name + id) · Shift · Operation (+ machine) · Window (start →
  end, plus elapsed) · Done · Rosak · Waste · Downtime (+ reason) · Status badge, with a red
  "supervisor called" flag where it applies
- Totals row across the bottom
- Empty state: timer icon, "No runs recorded"

---

## 10. The flow end to end, as built

```
1. INTAKE      Upload a customer file, or type it in  →  draft job sheet
2. PLAN        Open the sheet layer
                 ├─ Lightbulb: AI plans the whole sheet in one click
                 └─ Or add work orders by hand, one tab each
               Per work order: pick BOM → pick route → machine slot unlocks
               Materials checked against stock on hand
                 └─ Short?  edit the quantity, or raise a PO (manager alerted)
3. CONFIRM     Confirm the job sheet  →  status becomes pending
               Every work order on it is confirmed and locked at the same time
               Blocked only if an order has no BOM, no route, no slot, or is short
4. APPROVE     Production manager approves  →  stock soft-reserved,
               work orders released to the floor
               Or returns it  →  back to draft, with the reason shown on the sheet
5. FLOOR       Released orders appear in Work in progress
               Operator runs record good units, rosak, waste, downtime
```

---

## 11. Existing design system

- **One accent colour** — apple green — reserved strictly for actions. Never decoration.
- **Status colours are semantic only**: grey draft, green confirmed, amber running, red stopped,
  teal done, violet pending approval. A status must never look like a button.
- **Radius lock**: 6px panels and controls, 8px tab tops, 4px badges. Nothing else.
- **Type**: Geist and Geist Mono. Body sizes cluster at 11 / 12 / 13px, headings 15–20px. Every
  number is mono and tabular so columns line up.
- **Hairline separators instead of nested cards.** No card inside a card.
- **Full light and dark theme** from one token set, following the OS with a manual override.
- Two-line cells throughout: the primary value with a dim secondary beneath it.

---

## 12. What I would like recommendations on

1. **The overlay pattern.** Is a modal layer over the list right for a screen where a planner may
   spend 20 minutes, or should it be a full page?
2. **Tabs for work orders.** Does browser-style tabbing scale when a sheet has eight or ten?
3. **The lightbulb.** The most valuable action in the product, currently a dashed-border button in
   the right column. Discoverable enough? Does it read as "AI does everything" or as decoration?
4. **The card rail.** Does a scrolling strip above a table earn its space, or duplicate the table?
5. **Status vocabulary.** Users say "draft, pending, confirm" but the system has six job sheet and
   six work order statuses. Where should states be merged or hidden?
6. **Density.** 11–13px throughout is deliberate for a data tool, but where does it break down?
7. **The shortage moment.** Where the planner's job actually gets hard. Today: a red button opening
   a popup with two choices. Better shape?
8. **Shop floor context.** The WIP screen may end up on a tablet near a machine, in poor light, with
   gloves on. It currently uses the same desktop density as everything else.

---

## 13. Constraints

- Desktop-first; the planner works at a wide screen all day.
- Light and dark must both work.
- A tool people live in, not something they visit once. Speed and legibility over first-impression
  polish.
- No illustration or marketing imagery.

## 14. Not built yet

Warehouse pick lists and material dispatch, the operator terminal itself, quality audit and the
rework loop, component reuse limits, and actual cost rollup at the end. The flow stops at the WIP
readout.
