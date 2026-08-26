import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowSquareOutIcon,
  ArrowUUpLeftIcon,
  CaretDownIcon,
  CheckCircleIcon,
  LightbulbFilamentIcon,
  SealCheckIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import {
  Button,
  EmptyState,
  JobSheetBadge,
  Metric,
  Panel,
  WorkOrderBadge,
  cx,
} from '@/components/ui'
import { fmtDate, fmtDateTime, fmtInt, fmtMoney } from '@/lib/format'
import type { JobSheet, JobSheetStatus, WorkOrder } from '@/types'

const FILTERS: Array<{ key: 'all' | JobSheetStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending_approval', label: 'Pending approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
]

export default function ConfirmedJobSheets() {
  const navigate = useNavigate()
  const mes = useMes()
  const [filter, setFilter] = useState<'all' | JobSheetStatus>('all')
  /* The sheet being reviewed. Approval reads the sheet in place, it does not leave. */
  const [openId, setOpenId] = useState<string | null>(null)

  const confirmed = mes.jobSheets.filter((s) => s.status !== 'draft')
  const rows = filter === 'all' ? confirmed : confirmed.filter((s) => s.status === filter)

  const countOf = (status: JobSheetStatus) => confirmed.filter((s) => s.status === status).length

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-gradient text-[20px] font-semibold tracking-tight">Confirmed job sheets</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Locked sheets moving through approval, release and production. Open a row to read the whole
          sheet here — goals, work orders, cost and stock — and approve it without leaving the queue.
        </p>
      </div>

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line md:grid-cols-4">
          {/* Each tile names a real state, so each carries that state's colour. */}
          <Metric
            label="Pending approval"
            value={fmtInt(countOf('pending_approval'))}
            dot="bg-st-hold"
            tone={countOf('pending_approval') ? 'text-st-hold' : undefined}
            hint="waiting on you"
          />
          <Metric
            label="Approved"
            value={fmtInt(countOf('approved'))}
            dot="bg-st-confirmed"
            hint="released to the floor"
          />
          <Metric
            label="In progress"
            value={fmtInt(countOf('in_progress'))}
            dot="bg-st-running"
            tone={countOf('in_progress') ? 'text-st-running' : undefined}
            hint="running now"
          />
          <Metric
            label="Completed"
            value={fmtInt(countOf('completed'))}
            dot="bg-st-done"
            hint="closed out"
          />
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              'rounded-[6px] border px-2.5 py-1 text-[12px] transition-colors duration-150',
              filter === f.key
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line-strong text-text-dim hover:bg-panel-2 hover:text-text',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Panel title={`Sheets (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<SealCheckIcon size={30} weight="light" />}
            title="Nothing at this status"
            body="Confirming a draft job sheet sends it here for the production manager to approve."
          />
        ) : (
          <ul>
            {rows.map((sheet) => {
              const orders = mes.workOrdersFor(sheet.id)
              const targetQty = sheet.goals.reduce((sum, g) => sum + g.targetQty, 0)
              const open = openId === sheet.id

              return (
                <li key={sheet.id} className="border-b border-line last:border-b-0">
                  {/*
                    The row is the disclosure. Approving is a reading job, so the
                    sheet opens underneath rather than throwing the manager onto
                    another screen and losing the queue.
                  */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : sheet.id)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      setOpenId(open ? null : sheet.id)
                    }}
                    className={cx(
                      'flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3',
                      'transition-colors duration-150',
                      open ? 'bg-accent-soft/30' : 'hover:bg-panel-2',
                    )}
                  >
                    <CaretDownIcon
                      size={13}
                      weight="bold"
                      aria-hidden
                      className={cx(
                        'shrink-0 text-text-faint transition-transform duration-150',
                        open && 'rotate-180 text-accent',
                      )}
                    />

                    <div className="flex min-w-[168px] flex-col items-start">
                      <span className="num text-[13px] font-medium">{sheet.code}</span>
                      <span className="num mt-0.5 text-[12px] text-text-faint">{sheet.reference}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{sheet.customer}</div>
                      <div className="mt-0.5 truncate text-[12px] text-text-faint">
                        {sheet.goals.map((g) => g.productName).join(' / ')}
                      </div>
                    </div>

                    <div className="hidden w-[104px] text-right lg:block">
                      <div className="num text-[13px]">{fmtInt(targetQty)}</div>
                      <div className="text-[12px] text-text-faint">target qty</div>
                    </div>

                    <div className="hidden w-[92px] text-right sm:block">
                      <div className="num text-[13px]">{orders.length}</div>
                      <div className="text-[12px] text-text-faint">work orders</div>
                    </div>

                    <div className="w-[112px] text-right">
                      <div className="num text-[13px]">{fmtDate(sheet.dueDate)}</div>
                      <div className="text-[12px] text-text-faint">due</div>
                    </div>

                    {/* Actions live inside the row, so they must not toggle it. */}
                    <div
                      className="flex w-[224px] items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {sheet.status === 'pending_approval' ? (
                        <>
                          <Button
                            variant="danger"
                            onClick={() =>
                              mes.rejectJobSheet(sheet.id, 'Costing needs review before release')
                            }
                            icon={<ArrowUUpLeftIcon size={14} weight="bold" />}
                          >
                            Return
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() => mes.approveJobSheet(sheet.id)}
                            icon={<CheckCircleIcon size={14} weight="bold" />}
                          >
                            Approve
                          </Button>
                        </>
                      ) : (
                        <JobSheetBadge status={sheet.status} />
                      )}
                    </div>
                  </div>

                  {open && (
                    <SheetReview
                      sheet={sheet}
                      orders={orders}
                      onOpenFull={() => navigate(`/job-sheets/${sheet.id}`)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------- review --- */

const cell = 'px-2.5 py-2 text-[13px] align-top'
const head = 'px-2.5 py-1.5 text-left text-[12px] font-medium text-text-faint'

/**
 * Everything a production manager needs to sign a sheet off, read-only: what was
 * promised, how it was planned, what it will cost and whether the stock is there.
 * The sheet is already locked, so nothing here is editable by design.
 */
function SheetReview({
  sheet,
  orders,
  onOpenFull,
}: {
  sheet: JobSheet
  orders: WorkOrder[]
  onOpenFull: () => void
}) {
  const mes = useMes()
  const remaining = mes.remainingByGoal(sheet.id)
  const plannedCost = orders.reduce((sum, w) => sum + (w.summary?.totalCost ?? 0), 0)
  const runHours = orders.reduce((sum, w) => sum + (w.summary?.runHours ?? 0), 0)
  const short = orders.filter((w) => w.feasibility === 'shortage')
  const aiBuilt = orders.filter((w) => w.mode === 'ai').length

  return (
    <div className="border-l-2 border-accent/45 bg-panel-2/40">
      {/* ------------------------------------------------------- identity --- */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-3 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-[15px] font-semibold tracking-tight">{sheet.code}</span>
            <JobSheetBadge status={sheet.status} />
          </div>
          <p className="mt-1 text-[13px] text-text-dim">
            {sheet.customer} <span className="text-text-faint">/</span>{' '}
            <span className="num">{sheet.reference}</span>{' '}
            <span className="text-text-faint">
              / raised by {sheet.createdBy} on {fmtDate(sheet.createdAt)}
            </span>
          </p>
          {sheet.approvedBy && (
            <p className="mt-0.5 text-[12px] text-st-confirmed">Approved by {sheet.approvedBy}.</p>
          )}
          {sheet.parentWorkOrderCode && (
            <p className="num mt-0.5 text-[12px] text-text-faint">
              Rework of {sheet.parentWorkOrderCode}.
            </p>
          )}
        </div>

        <Button onClick={onOpenFull} icon={<ArrowSquareOutIcon size={14} weight="bold" />}>
          Open full sheet
        </Button>
      </div>

      {/* ---------------------------------------------------------- totals --- */}
      <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line md:grid-cols-4 md:divide-y-0">
        <Metric label="Planned cost" value={fmtMoney(plannedCost)} hint="across every work order" />
        <Metric label="Run time" value={`${Math.round(runHours * 10) / 10} h`} hint="setup and cycle" />
        <Metric
          label="Stock"
          value={short.length ? `${short.length} short` : 'Covered'}
          tone={short.length ? 'text-st-stopped' : 'text-st-done'}
          dot={short.length ? 'bg-st-stopped' : 'bg-st-done'}
        />
        <Metric
          label="Built by AI"
          value={`${fmtInt(aiBuilt)} of ${fmtInt(orders.length)}`}
          hint="rest entered by hand"
        />
      </div>

      {/* ----------------------------------------------------------- goals --- */}
      <div className="border-b border-line px-3 py-3">
        <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">Goal</h3>
        <table className="mt-2 w-full">
          <thead className="border-b border-line">
            <tr>
              <th className={head}>Item</th>
              <th className={cx(head, 'w-[120px] text-right')}>Qty</th>
              <th className={cx(head, 'w-[140px] text-right')}>Still need</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sheet.goals.map((goal) => {
              const left = remaining[goal.id] ?? 0
              return (
                <tr key={goal.id}>
                  <td className={cell}>
                    <div className="num text-[12px] text-text-faint">{goal.productCode}</div>
                    <div>{goal.productName}</div>
                  </td>
                  <td className={cx(cell, 'num text-right')}>
                    {fmtInt(goal.targetQty)} <span className="text-text-faint">{goal.unit}</span>
                  </td>
                  <td className={cx(cell, 'text-right')}>
                    <div className={cx('num', left > 0 ? 'text-st-stopped' : 'text-st-done')}>
                      {fmtInt(left)}
                    </div>
                    <div className="text-[12px] text-text-faint">
                      {left > 0 ? 'not covered' : 'fully covered'}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------- work orders --- */}
      <div className="px-3 py-3">
        <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">
          Work orders ({orders.length})
        </h3>

        {orders.length === 0 ? (
          <p className="mt-2 text-[12px] text-text-dim">
            No work orders on this sheet. Nothing will reach the floor when it is approved.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={head}>Work order</th>
                  <th className={head}>Item</th>
                  <th className={head}>BOM &amp; route</th>
                  <th className={head}>Machine slot</th>
                  <th className={cx(head, 'w-[120px] text-right')}>Cost</th>
                  <th className={cx(head, 'w-[120px]')}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((wo) => {
                  const goal = sheet.goals.find((g) => g.id === wo.goalId)
                  return (
                    <tr key={wo.id}>
                      <td className={cell}>
                        <div className="flex items-center gap-1.5">
                          <span className="num font-medium">{wo.code}</span>
                          {wo.mode === 'ai' && (
                            <LightbulbFilamentIcon
                              size={12}
                              weight="fill"
                              className="text-accent"
                              aria-label="AI-assigned"
                            />
                          )}
                        </div>
                        <div className="num mt-0.5 text-[12px] text-text-faint">
                          {fmtInt(wo.qty)} {wo.unit}
                        </div>
                      </td>

                      <td className={cx(cell, 'text-[12px]')}>
                        {goal?.productName ?? 'Unassigned item'}
                      </td>

                      <td className={cx(cell, 'num text-[12px] text-text-dim')}>
                        {wo.bom.length} lines · {wo.route.length} steps
                        {wo.summary && (
                          <div className="mt-0.5 text-text-faint">
                            {wo.summary.runHours} h, {fmtInt(wo.summary.expectedOutput)} expected out
                          </div>
                        )}
                      </td>

                      <td className={cx(cell, 'num text-[12px] text-text-dim')}>
                        {wo.slot ? (
                          <>
                            <div>{wo.slot.machine}</div>
                            <div className="mt-0.5 text-text-faint">
                              {fmtDateTime(wo.slot.startsAt)} → {fmtDateTime(wo.slot.endsAt)}
                            </div>
                          </>
                        ) : (
                          <span className="text-st-stopped">no slot booked</span>
                        )}
                      </td>

                      <td className={cx(cell, 'num text-right')}>
                        {wo.summary ? fmtMoney(wo.summary.totalCost) : '—'}
                      </td>

                      <td className={cell}>
                        <div className="flex flex-col items-start gap-1">
                          <WorkOrderBadge status={wo.status} />
                          {wo.feasibility === 'shortage' && (
                            <span className="flex items-center gap-1 text-[12px] text-st-stopped">
                              <WarningOctagonIcon size={11} weight="fill" />
                              {wo.purchaseRequests.length} PR open
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {sheet.status === 'pending_approval' && (
          <p className="mt-3 text-[12px] text-text-faint">
            Approving soft-reserves the stock above and releases every work order to the floor.
            Returning it unlocks the sheet so the planner can edit it again.
          </p>
        )}
      </div>
    </div>
  )
}
