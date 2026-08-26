import { useMemo, useState, type ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon,
  ArrowsDownUpIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FileArrowUpIcon,
  FileDashedIcon,
  KeyboardIcon,
  LightbulbFilamentIcon,
  MagnifyingGlassIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { NewJobSheetDialog } from '@/components/NewJobSheetDialog'
import { Button, EmptyState, JobSheetBadge, Panel, cx, inputClass } from '@/components/ui'
import { daysUntil, fmtDate, fmtDateTime, fmtInt } from '@/lib/format'
import type { DemandSource, JobSheet, JobSheetStatus, WorkOrder } from '@/types'

const SOURCE_LABEL: Record<DemandSource, string> = {
  sales_order: 'Sales order',
  forecast: 'Forecast',
  rework: 'Rework',
}

/* -------------------------------------------------------- work order state --- */

/**
 * What the planner calls the work order, which is not the raw status. A draft
 * that failed feasibility is "Pending PO" because it is waiting on purchasing,
 * and anything on the floor collapses into "Work in progress".
 */
type WoView = { label: string; tone: string; wip: boolean }

function woView(wo: WorkOrder): WoView {
  if (wo.status === 'released' || wo.status === 'running' || wo.status === 'stopped') {
    return { label: 'Work in progress', tone: 'text-st-running bg-st-running/10 border-st-running/35', wip: true }
  }
  if (wo.status === 'completed') {
    return { label: 'Completed', tone: 'text-st-done bg-st-done/10 border-st-done/35', wip: false }
  }
  if (wo.status === 'confirmed') {
    return { label: 'Confirmed', tone: 'text-st-confirmed bg-st-confirmed/10 border-st-confirmed/35', wip: false }
  }
  if (wo.feasibility === 'shortage') {
    return { label: 'Pending PO', tone: 'text-st-stopped bg-st-stopped/10 border-st-stopped/35', wip: false }
  }
  return { label: 'Draft', tone: 'text-st-draft bg-st-draft/10 border-st-draft/35', wip: false }
}

/* ----------------------------------------------------------- filter + sort --- */

const STATUS_FILTERS: Array<{ key: 'all' | JobSheetStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Confirmed' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
]

type SortKey = 'lastModifiedAt' | 'createdAt' | 'dueDate' | 'customer' | 'code'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'lastModifiedAt', label: 'Last modified' },
  { key: 'createdAt', label: 'Created' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'customer', label: 'Client' },
  { key: 'code', label: 'Order ID' },
]

const PAGE_SIZES = [10, 25, 50]

/* ------------------------------------------------------------------- page --- */

export default function JobSheets() {
  const navigate = useNavigate()
  const { jobSheets, workOrdersFor } = useMes()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | JobSheetStatus>('all')
  const [sortKey, setSortKey] = useState<SortKey>('lastModifiedAt')
  const [desc, setDesc] = useState(true)
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newSheet, setNewSheet] = useState<'upload' | 'manual' | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = jobSheets.filter((s) => {
      if (status !== 'all' && s.status !== status) return false
      if (!q) return true
      return (
        s.code.toLowerCase().includes(q) ||
        s.customer.toLowerCase().includes(q) ||
        s.reference.toLowerCase().includes(q) ||
        s.goals.some((g) => g.productName.toLowerCase().includes(q))
      )
    })
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = sortKey === 'customer' || sortKey === 'code' ? av.localeCompare(bv) : av < bv ? -1 : av > bv ? 1 : 0
      return desc ? -cmp : cmp
    })
    return sorted
  }, [jobSheets, query, status, sortKey, desc])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const visible = rows.slice(current * pageSize, current * pageSize + pageSize)

  /* Cards up top: what a planner opens first. Unfinished sheets, soonest due. */
  const spotlight = useMemo(
    () =>
      [...jobSheets]
        .filter((s) => s.status !== 'completed')
        .sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate))
        .slice(0, 8),
    [jobSheets],
  )

  const reset = (fn: () => void) => {
    fn()
    setPage(0)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Job sheets</h1>
          <p className="mt-0.5 text-[13px] text-text-dim">
            Every sheet in the plant, draft through completion. Open a sheet to build it, or jump
            straight to a work order already running on the floor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-baseline gap-1.5 rounded-[6px] border border-line bg-panel px-3 py-1.5">
            <span className="num text-[15px] font-medium text-accent">
              {fmtInt(jobSheets.length)}
            </span>
            <span className="text-[12px] text-text-dim">sheets</span>
          </div>
          <Button
            onClick={() => setNewSheet('manual')}
            icon={<KeyboardIcon size={15} weight="bold" />}
          >
            Input job sheet
          </Button>
          <Button
            variant="primary"
            onClick={() => setNewSheet('upload')}
            icon={<FileArrowUpIcon size={15} weight="bold" />}
          >
            Upload job sheet
          </Button>
        </div>
      </div>

      <SpotlightRail sheets={spotlight} onOpen={(id) => navigate(`/job-sheets/${id}`)} />

      {/* ------------------------------------------------------ filter & sort --- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
          <MagnifyingGlassIcon
            size={14}
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query}
            onChange={(e) => reset(() => setQuery(e.target.value))}
            placeholder="Order ID, client, item"
            className={cx(inputClass, 'pl-8')}
            aria-label="Search job sheets"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => reset(() => setStatus(f.key))}
              className={cx(
                'rounded-[6px] border px-2.5 py-1.5 text-[12px] transition-colors duration-150',
                status === f.key
                  ? 'border-accent bg-accent-soft font-medium text-accent'
                  : 'border-line-strong text-text-dim hover:bg-panel-2 hover:text-text',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <select
            value={sortKey}
            onChange={(e) => reset(() => setSortKey(e.target.value as SortKey))}
            className={cx(inputClass, 'w-auto py-1.5')}
            aria-label="Sort by"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setDesc((d) => !d)}
            title={desc ? 'Descending' : 'Ascending'}
            aria-label={desc ? 'Sorted descending, switch to ascending' : 'Sorted ascending, switch to descending'}
            className="inline-flex items-center gap-1 rounded-[6px] border border-line-strong px-2 py-1.5 text-[12px] text-text-dim transition-colors duration-150 hover:bg-panel-2 hover:text-text"
          >
            <ArrowsDownUpIcon size={14} weight="bold" />
            {desc ? 'Desc' : 'Asc'}
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------- table --- */}
      <Panel className="overflow-hidden">
        <div className="hidden items-center gap-4 border-b border-line bg-panel-2/60 px-3 py-2 text-[11px] font-medium tracking-wide text-text-faint uppercase md:flex">
          <span className="w-5" />
          <span className="min-w-[168px]">Order ID</span>
          <span className="min-w-0 flex-1">Client</span>
          <span className="w-[120px] text-right">Created</span>
          <span className="w-[132px] text-right">Last modified</span>
          <span className="w-[150px] text-right">Status</span>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<FileDashedIcon size={30} weight="light" />}
            title="No job sheets match"
            body="Clear the search or pick another status. New sales orders and forecast runs land here as drafts."
          />
        ) : (
          <ul>
            {visible.map((sheet) => (
              <SheetRow
                key={sheet.id}
                sheet={sheet}
                orders={workOrdersFor(sheet.id)}
                open={openId === sheet.id}
                onToggle={() => setOpenId((id) => (id === sheet.id ? null : sheet.id))}
                onOpenSheet={() => navigate(`/job-sheets/${sheet.id}`)}
                onOpenWorkOrder={(wo) => {
                  const view = woView(wo)
                  navigate(view.wip ? `/wip/${wo.id}` : `/job-sheets/${sheet.id}?wo=${wo.id}`)
                }}
              />
            ))}
          </ul>
        )}

        {/* --------------------------------------------------------- paging --- */}
        <div className="flex flex-wrap items-center justify-end gap-4 border-t border-line px-3 py-2">
          <label className="flex items-center gap-1.5 text-[12px] text-text-dim">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => reset(() => setPageSize(Number(e.target.value)))}
              className={cx(inputClass, 'w-auto py-1')}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <span className="num text-[12px] text-text-dim">
            {rows.length === 0 ? '0' : `${current * pageSize + 1}-${current * pageSize + visible.length}`} of{' '}
            {fmtInt(rows.length)}
          </span>

          <div className="flex items-center gap-1">
            <PageButton
              label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              icon={<CaretLeftIcon size={14} weight="bold" />}
            />
            <PageButton
              label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
              icon={<CaretRightIcon size={14} weight="bold" />}
            />
          </div>
        </div>
      </Panel>

      {newSheet && (
        <NewJobSheetDialog
          initialMode={newSheet}
          onClose={() => setNewSheet(null)}
          onCreated={(id) => navigate(`/job-sheets/${id}`)}
        />
      )}

      {/* The job sheet layer renders here, over this list. */}
      <Outlet />
    </div>
  )
}

/* ------------------------------------------------------------ spotlight --- */

function SpotlightRail({ sheets, onOpen }: { sheets: JobSheet[]; onOpen: (id: string) => void }) {
  const { workOrdersFor } = useMes()
  if (sheets.length === 0) return null

  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
      {sheets.map((sheet) => {
        const orders = workOrdersFor(sheet.id)
        const done = orders.filter((w) => w.status !== 'draft').length
        const pct = orders.length ? Math.round((done / orders.length) * 100) : 0
        const days = daysUntil(sheet.dueDate)
        const targetQty = sheet.goals.reduce((sum, g) => sum + g.targetQty, 0)
        const aiBuilt = orders.some((w) => w.mode === 'ai')
        const shortage = orders.some((w) => w.feasibility === 'shortage')

        return (
          <button
            key={sheet.id}
            onClick={() => onOpen(sheet.id)}
            className="group w-[248px] shrink-0 snap-start rounded-[6px] border border-line bg-panel p-3 text-left transition-colors duration-150 hover:border-accent/60 hover:bg-accent-soft/35"
          >
            <div className="flex items-center gap-1.5">
              <span className="num text-[13px] font-medium">{sheet.code}</span>
              {aiBuilt && (
                <LightbulbFilamentIcon
                  size={13}
                  weight="fill"
                  className="text-accent"
                  aria-label="AI-assigned"
                />
              )}
              {shortage && (
                <WarningOctagonIcon
                  size={13}
                  weight="fill"
                  className="text-st-stopped"
                  aria-label="Material shortage"
                />
              )}
              <ArrowRightIcon
                size={13}
                weight="bold"
                className="ml-auto text-text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
              />
            </div>

            <div className="mt-1 truncate text-[13px]">{sheet.customer}</div>
            <div className="mt-0.5 truncate text-[11px] text-text-faint">
              {sheet.goals.map((g) => g.productName).join(' / ')}
            </div>

            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-text-faint">
              <span className="num">
                {done}/{orders.length} WO · {fmtInt(targetQty)} pcs
              </span>
              <span className={cx('num', days < 7 ? 'text-st-stopped' : 'text-text-dim')}>
                {days < 0 ? `${Math.abs(days)}d over` : `in ${days}d`}
              </span>
            </div>

            <div className="mt-2">
              <JobSheetBadge status={sheet.status} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- rows --- */

function SheetRow({
  sheet,
  orders,
  open,
  onToggle,
  onOpenSheet,
  onOpenWorkOrder,
}: {
  sheet: JobSheet
  orders: WorkOrder[]
  open: boolean
  onToggle: () => void
  onOpenSheet: () => void
  onOpenWorkOrder: (wo: WorkOrder) => void
}) {
  const shortage = orders.some((w) => w.feasibility === 'shortage')

  return (
    <li className="border-b border-line last:border-b-0">
      <div
        className={cx(
          'flex items-center gap-4 px-3 py-2.5 transition-colors duration-150',
          open ? 'bg-accent-soft/30' : 'hover:bg-panel-2',
        )}
      >
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Hide work orders for ${sheet.code}` : `Show work orders for ${sheet.code}`}
          className="flex w-5 shrink-0 items-center justify-center text-text-faint hover:text-accent"
        >
          <CaretDownIcon
            size={14}
            weight="bold"
            className={cx('transition-transform duration-150', open && 'rotate-180')}
          />
        </button>

        <button onClick={onOpenSheet} className="min-w-[168px] shrink-0 text-left">
          <span className="num text-[13px] font-medium hover:text-accent">{sheet.code}</span>
          <span className="mt-0.5 block text-[11px] text-text-faint">
            {SOURCE_LABEL[sheet.source]} <span className="num">{sheet.reference}</span>
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px]">{sheet.customer}</div>
          <div className="mt-0.5 truncate text-[11px] text-text-faint">
            {sheet.goals.map((g) => g.productName).join(' / ')}
          </div>
        </div>

        <div className="hidden w-[120px] text-right md:block">
          <div className="num text-[12px]">{fmtDate(sheet.createdAt)}</div>
          <div className="text-[11px] text-text-faint">{sheet.createdBy}</div>
        </div>

        <div className="hidden w-[132px] text-right md:block">
          <div className="num text-[12px]">{fmtDateTime(sheet.lastModifiedAt)}</div>
          <div className="text-[11px] text-text-faint">last modified</div>
        </div>

        <div className="flex w-[150px] items-center justify-end gap-2">
          {shortage && (
            <WarningOctagonIcon
              size={14}
              weight="fill"
              className="text-st-stopped"
              aria-label="Material shortage"
            />
          )}
          <JobSheetBadge status={sheet.status} />
        </div>
      </div>

      {open && <WorkOrderList sheet={sheet} orders={orders} onOpen={onOpenWorkOrder} />}
    </li>
  )
}

function WorkOrderList({
  sheet,
  orders,
  onOpen,
}: {
  sheet: JobSheet
  orders: WorkOrder[]
  onOpen: (wo: WorkOrder) => void
}) {
  if (orders.length === 0) {
    return (
      <div className="border-l-2 border-accent/45 bg-panel-2/50 px-3 py-3 pl-8 text-[12px] text-text-dim">
        No work orders yet. Open <span className="num">{sheet.code}</span> to split its goals into work
        orders.
      </div>
    )
  }

  return (
    <div className="border-l-2 border-accent/45 bg-panel-2/50 py-1 pl-6">
      <ul>
        {orders.map((wo) => {
          const goal = sheet.goals.find((g) => g.id === wo.goalId)
          const view = woView(wo)
          return (
            <li key={wo.id}>
              <button
                onClick={() => onOpen(wo)}
                className="group flex w-full items-center gap-4 px-3 py-2 text-left transition-colors duration-150 hover:bg-panel"
              >
                <span className="num w-[136px] shrink-0 text-[12px] font-medium group-hover:text-accent">
                  {wo.code}
                </span>

                <span className="min-w-0 flex-1 truncate text-[12px]">
                  {goal?.productName ?? 'Unassigned item'}
                  <span className="num ml-2 text-[11px] text-text-faint">
                    {fmtInt(wo.qty)} {wo.unit}
                  </span>
                </span>

                {wo.mode === 'ai' && (
                  <LightbulbFilamentIcon
                    size={13}
                    weight="fill"
                    className="shrink-0 text-accent"
                    aria-label="AI-assigned"
                  />
                )}

                <span
                  className={cx(
                    'inline-flex shrink-0 items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none font-medium',
                    view.tone,
                  )}
                >
                  {view.label}
                </span>

                <span className="w-[92px] shrink-0 text-right text-[11px] text-text-faint">
                  {view.wip ? (
                    <span className="inline-flex items-center gap-1 text-accent">
                      Open WIP
                      <ArrowRightIcon
                        size={12}
                        weight="bold"
                        className="transition-transform duration-150 group-hover:translate-x-0.5"
                      />
                    </span>
                  ) : (
                    'Edit in sheet'
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PageButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-line-strong text-text-dim transition-colors duration-150 hover:bg-panel-2 hover:text-text disabled:pointer-events-none disabled:opacity-35"
    >
      {icon}
    </button>
  )
}
