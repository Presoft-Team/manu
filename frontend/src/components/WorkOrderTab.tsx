import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  HandPointingIcon,
  LightbulbFilamentIcon,
  LockSimpleIcon,
  ReceiptIcon,
  TrashIcon,
  WarningOctagonIcon,
  XIcon,
} from '@phosphor-icons/react'
import { BOM_LIBRARY, ROUTE_LIBRARY } from '@/data/seed'
import { useMes } from '@/store/mes'
import { Button, Metric, SavedIndicator, WorkOrderBadge, cx, inputClass } from '@/components/ui'
import { MachineSchedule } from '@/components/MachineSchedule'
import { fmtDateTime, fmtInt, fmtMoney, fmtQty } from '@/lib/format'
import type { BomLine, JobSheet, WorkOrder } from '@/types'

const head = 'px-2.5 py-1.5 text-left text-[12px] font-medium text-text-faint'
const cell = 'px-2.5 py-2 text-[13px]'

/** On the floor: the tab goes read-only and offers the WIP screen instead. */
const isWip = (wo: WorkOrder) =>
  wo.status === 'released' || wo.status === 'running' || wo.status === 'stopped'

export function WorkOrderTab({
  wo,
  sheet,
  onClose,
}: {
  wo: WorkOrder
  sheet: JobSheet
  onClose: () => void
}) {
  const mes = useMes()
  const navigate = useNavigate()
  const goal = sheet.goals.find((g) => g.id === wo.goalId)
  const locked = mes.workOrderLocked(wo.id)
  const wip = isWip(wo)

  /** The machine slot stays sealed until both a BOM and a route are chosen. */
  const planned = !!wo.bomTemplateId && !!wo.routeTemplateId
  /*
    The shortage editor is anchored to the row that opened it rather than being a
    centred modal, so the planner's eye never leaves the offending material. It
    is positioned `fixed` from the button's rect because the table scrolls
    horizontally and would clip an absolutely positioned child.
  */
  const [shortLine, setShortLine] = useState<{ line: BomLine; top: number; left: number } | null>(
    null,
  )

  const openShortage = (line: BomLine, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const width = 380
    setShortLine({
      line,
      top: Math.min(r.bottom + 8, window.innerHeight - 340),
      left: Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)),
    })
  }

  const bomCost = wo.bom.reduce((sum, l) => sum + l.requiredQty * l.unitCost, 0)
  const shortCount = wo.bom.filter((l) => l.requiredQty > l.onHandQty).length

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ---------------------------------------------------------- head --- */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="num text-[17px] font-semibold tracking-tight">{wo.code}</h2>
          <WorkOrderBadge status={wo.status} />
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[12px] leading-none',
              wo.mode === 'ai'
                ? 'border-accent/35 bg-accent-soft text-accent'
                : 'border-line-strong text-text-dim',
            )}
          >
            {wo.mode === 'ai' ? (
              <LightbulbFilamentIcon size={12} weight="fill" />
            ) : (
              <HandPointingIcon size={12} weight="bold" />
            )}
            {wo.mode === 'ai' ? 'AI assigned' : 'Manual'}
          </span>

          {locked && (
            <span className="ml-auto flex items-center gap-1.5 text-[12px] text-text-dim">
              <LockSimpleIcon size={13} weight="fill" className="text-st-confirmed" />
              {mes.jobSheetLocked(sheet.id)
                ? `Locked by ${sheet.code}`
                : `Confirmed ${wo.confirmedAt ? fmtDateTime(wo.confirmedAt) : ''}`}
            </span>
          )}
        </div>

        {/* ------------------------------------ goal / BOM / route selectors --- */}
        <div className="grid gap-4 border-b border-line p-4 lg:grid-cols-3">
          <div>
            <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">Goal</h3>
            <div className="num mt-2 text-[12px] text-text-faint">{goal?.productCode}</div>
            <div className="text-[13px]">{goal?.productName ?? 'Unassigned item'}</div>
            <label className="mt-2.5 flex items-center gap-2">
              <span className="text-[12px] text-text-dim">Qty</span>
              <input
                type="number"
                min={1}
                value={wo.qty}
                disabled={locked}
                onChange={(e) =>
                  mes.patchWorkOrder(wo.id, { qty: Math.max(1, Number(e.target.value) || 1) })
                }
                className={cx(inputClass, 'num w-28 py-1 text-right')}
              />
              <span className="text-[12px] text-text-faint">{wo.unit}</span>
            </label>
            <p className="mt-1 text-[12px] text-text-faint">
              Drives BOM quantities and route run time.
            </p>
          </div>

          <Selector
            label="BOM"
            value={wo.bomTemplateId ?? ''}
            disabled={locked}
            onChange={(v) => mes.applyBomTemplate(wo.id, v)}
            options={BOM_LIBRARY.map((t) => ({
              value: t.id,
              label: `${t.code} · ${t.name}`,
              suggested: t.family === (goal?.productCode.split('-')[1] ?? ''),
            }))}
            footnote={
              wo.bom.length
                ? `${wo.bom.length} material line${wo.bom.length > 1 ? 's' : ''}, ${fmtMoney(bomCost)}`
                : 'No bill of materials selected yet.'
            }
          />

          <Selector
            label="Route"
            value={wo.routeTemplateId ?? ''}
            disabled={locked}
            onChange={(v) => mes.applyRouteTemplate(wo.id, v)}
            options={ROUTE_LIBRARY.map((t) => ({
              value: t.id,
              label: `${t.code} · ${t.name}`,
              suggested: t.family === (goal?.productCode.split('-')[1] ?? ''),
            }))}
            footnote={
              wo.route.length
                ? wo.route.map((s) => s.operation).join(' → ')
                : 'No route selected yet.'
            }
          />
        </div>

        {/* ------------------------------------------------------ materials --- */}
        <section className="border-b border-line">
          <header className="flex h-9 items-center justify-between gap-3 px-4">
            <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">
              Material
            </h3>
            {shortCount > 0 && (
              <span className="flex items-center gap-1.5 text-[12px] text-st-stopped">
                <WarningOctagonIcon size={13} weight="fill" />
                {shortCount} line{shortCount > 1 ? 's' : ''} short on stock
              </span>
            )}
          </header>

          {wo.bom.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-text-dim">
              Select a BOM above to load its material lines.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-y border-line bg-panel-2/50">
                  <tr>
                    <th className={cx(head, 'w-[150px]')}>Material id</th>
                    <th className={head}>Name</th>
                    <th className={cx(head, 'w-[124px] text-right')}>Qty</th>
                    <th className={cx(head, 'w-[124px] text-right')}>Qty in hand</th>
                    <th className={cx(head, 'w-[132px] text-right')}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {wo.bom.map((line) => {
                    const short = line.requiredQty > line.onHandQty
                    const raised = wo.purchaseRequests.some(
                      (pr) => pr.materialCode === line.materialCode,
                    )
                    return (
                      <tr key={line.id} className={cx(short && 'bg-st-stopped/5')}>
                        <td className={cx(cell, 'num text-[12px] text-text-dim')}>
                          <span className="flex items-center gap-1.5">
                            {line.materialCode}
                            {line.aiAssigned && (
                              <LightbulbFilamentIcon
                                size={11}
                                weight="fill"
                                className="text-accent"
                                aria-label="AI assigned"
                              />
                            )}
                          </span>
                        </td>
                        <td className={cx(cell, 'text-[12px]')}>{line.name}</td>
                        <td className={cx(cell, 'num text-right', short && 'text-st-stopped')}>
                          {fmtQty(line.requiredQty)}{' '}
                          <span className="text-[12px] text-text-faint">{line.unit}</span>
                        </td>
                        <td className={cx(cell, 'num text-right text-text-dim')}>
                          {fmtQty(line.onHandQty)}{' '}
                          <span className="text-[12px] text-text-faint">{line.unit}</span>
                        </td>
                        <td className={cx(cell, 'text-right')}>
                          {!short ? (
                            <span className="text-[12px] text-st-confirmed">In stock</span>
                          ) : raised ? (
                            <span className="inline-flex items-center gap-1 text-[12px] text-st-running">
                              <ReceiptIcon size={12} weight="bold" />
                              PO raised
                            </span>
                          ) : (
                            <button
                              onClick={(e) => openShortage(line, e.currentTarget)}
                              disabled={locked}
                              aria-haspopup="dialog"
                              aria-expanded={shortLine?.line.id === line.id}
                              className="rounded-[4px] border border-st-stopped/40 px-1.5 py-0.5 text-[12px] font-medium text-st-stopped transition-all duration-200 ease-spring hover:bg-st-stopped/10 disabled:pointer-events-none disabled:opacity-50"
                            >
                              Not enough
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------- machine slot --- */}
        <section className="border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">
              Machine slot
            </h3>
            {!locked && (
              <Button
                onClick={() => mes.autoSchedule(wo.id)}
                disabled={!planned}
                icon={<CalendarCheckIcon size={14} weight="bold" />}
              >
                {/* Rescheduling is the drag. This button only ever asks the scheduler. */}
                {wo.slot ? 'Find earliest window' : 'Book slot'}
              </Button>
            )}
          </div>

          {!planned ? (
            <p className="mt-2 flex items-center gap-2 rounded-[6px] border border-dashed border-line-strong bg-panel-2/40 px-3 py-3 text-[12px] text-text-faint">
              <LockSimpleIcon size={14} weight="fill" className="shrink-0" />
              Available only after a BOM and a route are selected.
            </p>
          ) : (
            <>
              {wo.slot ? (
                <div className="mt-2 rounded-[6px] border border-line bg-panel-2/40 px-3 py-2.5">
                  <div className="num text-[13px] font-medium">{wo.slot.machine}</div>
                  <div className="num mt-0.5 text-[12px] text-text-dim">
                    {fmtDateTime(wo.slot.startsAt)} to {fmtDateTime(wo.slot.endsAt)}
                  </div>
                  <div className="mt-1 text-[12px] text-text-faint">
                    {wo.slot.autoScheduled
                      ? 'Auto-scheduled, earliest free window'
                      : 'Assigned by a planner'}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-text-dim">
                  No slot booked yet on {wo.route[0]?.machine}. Book one to place this order on the
                  strip below.
                </p>
              )}

              {/*
                The whole floor, not just this order: a slot is only sensible next
                to what the other machines are already carrying.
              */}
              <div className="mt-3 rounded-[6px] border border-line bg-panel-2/30 px-3 py-3">
                <MachineSchedule
                  workOrders={mes.workOrders}
                  highlight={wo.code}
                  editable={locked ? undefined : wo.code}
                  onMove={(machine, startsAt) => mes.moveSlot(wo.id, machine, startsAt)}
                />
                {!locked && wo.slot && (
                  <p className="mt-2 text-[12px] text-text-faint">
                    Drag this order's bar to reschedule it: sideways to move it in time, onto
                    another row to move it to that machine. It snaps to the half hour, and a drop
                    that would double-book a machine is refused.
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        {/* --------------------------------------------------------- costing --- */}
        {wo.summary && (
          <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
            <Metric
              label="Expected output"
              value={`${fmtInt(wo.summary.expectedOutput)} ${wo.unit}`}
              hint={`${fmtInt(wo.summary.scrapAllowance)} scrap allowance`}
            />
            <Metric label="Run time" value={`${wo.summary.runHours} h`} hint="setup plus cycle" />
            <Metric label="Material cost" value={fmtMoney(wo.summary.materialCost)} />
            <Metric
              label="Total cost"
              value={fmtMoney(wo.summary.totalCost)}
              hint={`labour ${fmtMoney(wo.summary.labourCost)}`}
            />
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- footer --- */}
      <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-line bg-panel-2/40 px-4 py-3">
        {wip ? (
          <Button
            variant="primary"
            className="min-w-[200px] justify-center"
            onClick={() => {
              onClose()
              navigate(`/wip/${wo.id}`)
            }}
            icon={<ArrowRightIcon size={15} weight="bold" />}
          >
            View work in progress
          </Button>
        ) : locked ? (
          <p className="flex items-center gap-2 text-[12px] text-text-dim">
            <LockSimpleIcon size={14} weight="fill" className="text-st-confirmed" />
            Confirmed with the job sheet. This work order is read only.
          </p>
        ) : (
          <>
            <Button
              variant="danger"
              className="min-w-[140px] justify-center"
              onClick={() => mes.removeWorkOrder(wo.id)}
              icon={<TrashIcon size={15} weight="bold" />}
            >
              Delete
            </Button>
            {/* Nothing to save: every edit above is already written. */}
            <SavedIndicator at={sheet.lastModifiedAt} />
          </>
        )}
      </footer>

      {shortLine && (
        <ShortagePopover
          wo={wo}
          line={shortLine.line}
          at={{ top: shortLine.top, left: shortLine.left }}
          onClose={() => setShortLine(null)}
          onRaisePo={() => {
            mes.raisePurchaseRequest(wo.id, shortLine.line.id)
            setShortLine(null)
          }}
          onEdit={(perUnit) => {
            mes.patchBomLine(wo.id, shortLine.line.id, { requiredPerUnit: perUnit })
            setShortLine(null)
          }}
        />
      )}
    </>
  )
}

/* -------------------------------------------------------------- selector --- */

function Selector({
  label,
  value,
  options,
  disabled,
  footnote,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string; suggested: boolean }>
  disabled: boolean
  footnote: string
  onChange: (value: string) => void
}) {
  const suggested = options.filter((o) => o.suggested)
  const rest = options.filter((o) => !o.suggested)

  return (
    <div>
      <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">{label}</h3>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cx(inputClass, 'mt-2')}
        aria-label={`Select a ${label.toLowerCase()}`}
      >
        <option value="">Select an item</option>
        {suggested.length > 0 && (
          <optgroup label="Matches this product">
            {suggested.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="All">
          {rest.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      </select>
      <p className="mt-1.5 truncate text-[12px] text-text-faint" title={footnote}>
        {footnote}
      </p>
    </div>
  )
}

/* ---------------------------------------------------- shortage popover --- */

/**
 * "If not enough, pop up: edit or PO." Both exits from a short material line,
 * anchored under the row's button so the planner stays on the offending material
 * rather than being pulled into a centred dialog.
 */
function ShortagePopover({
  wo,
  line,
  at,
  onClose,
  onEdit,
  onRaisePo,
}: {
  wo: WorkOrder
  line: BomLine
  at: { top: number; left: number }
  onClose: () => void
  onEdit: (requiredPerUnit: number) => void
  onRaisePo: () => void
}) {
  const [perUnit, setPerUnit] = useState(line.requiredPerUnit)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    // Deferred, so the click that opened this does not immediately close it.
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const required = Number((perUnit * wo.qty).toFixed(2))
  const stillShort = required > line.onHandQty
  /** Largest per-unit figure this order can cover from stock on hand. */
  const fits = Math.floor((line.onHandQty / wo.qty) * 1000) / 1000

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Not enough ${line.materialCode}`}
      style={{ top: at.top, left: at.left }}
      className="glass animate-pop-in fixed z-[65] w-[380px] rounded-[6px] border border-line-strong bg-panel/95 shadow-2xl shadow-black/25"
    >
      <header className="flex h-10 items-center justify-between border-b border-line px-3">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-st-stopped">
          <WarningOctagonIcon size={15} weight="fill" />
          Not enough {line.materialCode}
        </h2>
        <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close">
          <XIcon size={14} weight="bold" />
        </button>
      </header>

      <div className="flex flex-col gap-3 p-3">
        <p className="text-[13px] text-text-dim">
          Needs{' '}
          <span className="num text-text">
            {fmtQty(line.requiredQty)} {line.unit}
          </span>
          , only{' '}
          <span className="num text-text">
            {fmtQty(line.onHandQty)} {line.unit}
          </span>{' '}
          on hand. Short by{' '}
          <span className="num text-st-stopped">
            {fmtQty(line.requiredQty - line.onHandQty)} {line.unit}
          </span>
          .
        </p>

        <div>
          <h3 className="text-[12px] font-medium">Edit the quantity</h3>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              step="0.001"
              min={0}
              value={perUnit}
              onChange={(e) => setPerUnit(Number(e.target.value) || 0)}
              className={cx(inputClass, 'num w-24 py-1 text-right')}
              aria-label="Required per unit"
            />
            <span className="text-[12px] text-text-dim">
              per unit ={' '}
              <span className={cx('num', stillShort && 'text-st-stopped')}>
                {fmtQty(required)} {line.unit}
              </span>
            </span>
          </div>
          <button
            onClick={() => setPerUnit(fits)}
            className="mt-1.5 text-[12px] text-accent hover:underline"
          >
            Use {fmtQty(fits)} per unit, the most stock covers
          </button>
        </div>

        <p className="border-t border-line pt-2.5 text-[12px] text-text-dim">
          Or raise a purchase request for the shortfall. The project manager is alerted and the work
          order stays in draft until stock lands.
        </p>
      </div>

      <footer className="flex justify-end gap-2 border-t border-line px-3 py-2.5">
        <Button onClick={onRaisePo} icon={<ReceiptIcon size={14} weight="bold" />}>
          Raise PO
        </Button>
        <Button
          variant="primary"
          disabled={perUnit === line.requiredPerUnit}
          onClick={() => onEdit(perUnit)}
        >
          Save quantity
        </Button>
      </footer>
    </div>
  )
}
