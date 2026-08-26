import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  CalendarBlankIcon,
  CheckCircleIcon,
  FloppyDiskIcon,
  LightbulbFilamentIcon,
  LockSimpleIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { NewWorkOrderDialog } from '@/components/NewWorkOrderDialog'
import { WorkOrderTab } from '@/components/WorkOrderTab'
import { Button, JobSheetBadge, cx } from '@/components/ui'
import { fmtDate, fmtInt } from '@/lib/format'
import type { WorkOrder } from '@/types'

/**
 * The job sheet does not get its own page. It opens as a layer over the job sheet
 * list, which stays visible underneath through an 80% scrim. Inside, one tab for
 * the sheet and one per work order, so the planner never loses the sheet context.
 */
export function JobSheetOverlay() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const mes = useMes()

  const sheet = mes.jobSheet(id)
  const orders = mes.workOrdersFor(id)
  const locked = mes.jobSheetLocked(id)

  // ?wo=<id> opens straight onto a work order tab, which is how the list links in.
  const [params] = useSearchParams()
  const [tab, setTab] = useState<string>(() => params.get('wo') ?? 'sheet')
  const [adding, setAdding] = useState(false)

  const close = () => navigate('/')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !adding) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `close` is stable enough here; the listener only needs the current `adding`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding])

  // Body scroll belongs to the layer while it is open, not the list behind it.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Keep the open tab valid when a work order is deleted underneath it.
  useEffect(() => {
    if (tab !== 'sheet' && !orders.some((o) => o.id === tab)) setTab('sheet')
  }, [orders, tab])

  if (!sheet) return null

  const active = orders.find((o) => o.id === tab) ?? null

  return (
    <div className="fixed inset-0 z-50 flex justify-center px-3 py-6 sm:px-6 sm:py-8">
      {/* The list stays legible behind this: 80% scrim, not a blackout. */}
      <div
        className="absolute inset-0 bg-surface/80 backdrop-blur-[2px]"
        onMouseDown={close}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Job sheet ${sheet.code}`}
        className="relative flex w-full max-w-[1180px] flex-col"
      >
        {/* ------------------------------------------------------- tab strip --- */}
        <div className="flex shrink-0 items-end gap-1 overflow-x-auto pb-0">
          <Tab
            label="JobSheet"
            code={sheet.code}
            active={tab === 'sheet'}
            tone="sheet"
            onClick={() => setTab('sheet')}
          />

          {orders.map((wo) => (
            <Tab
              key={wo.id}
              label="WorkOrder"
              code={wo.code}
              active={tab === wo.id}
              tone={toneOf(wo)}
              ai={wo.mode === 'ai'}
              onClick={() => setTab(wo.id)}
            />
          ))}

          {!locked && (
            <button
              onClick={() => setAdding(true)}
              aria-label="Add work order"
              title="Add work order"
              className="mb-1 ml-0.5 shrink-0 rounded-[6px] border border-line-strong bg-panel/70 p-1.5 text-text-dim transition-colors duration-150 hover:border-accent hover:text-accent"
            >
              <PlusIcon size={14} weight="bold" />
            </button>
          )}

          <button
            onClick={close}
            aria-label="Close job sheet"
            className="mb-1 ml-auto shrink-0 rounded-[6px] border border-line-strong bg-panel/70 p-1.5 text-text-dim transition-colors duration-150 hover:border-st-stopped hover:text-st-stopped"
          >
            <XIcon size={14} weight="bold" />
          </button>
        </div>

        {/* ------------------------------------------------------------ card --- */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] rounded-tl-none border border-line-strong bg-panel shadow-2xl shadow-black/20">
          {active ? (
            <WorkOrderTab wo={active} sheet={sheet} onClose={close} />
          ) : (
            <SheetTab sheetId={sheet.id} onAddWorkOrder={() => setAdding(true)} />
          )}
        </div>
      </div>

      {adding && (
        <NewWorkOrderDialog
          sheet={sheet}
          onClose={() => setAdding(false)}
          onCreated={(woId) => setTab(woId)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ tabs --- */

type Tone = 'sheet' | 'draft' | 'confirmed' | 'wip'

function toneOf(wo: WorkOrder): Tone {
  if (wo.status === 'released' || wo.status === 'running' || wo.status === 'stopped') return 'wip'
  if (wo.status === 'draft') return 'draft'
  return 'confirmed'
}

const INACTIVE_TONE: Record<Tone, string> = {
  sheet: 'border-line bg-panel-2/80 text-text-dim hover:bg-panel',
  draft: 'border-line bg-panel-2/80 text-text-dim hover:bg-panel',
  confirmed: 'border-st-confirmed/30 bg-st-confirmed/10 text-st-confirmed hover:bg-st-confirmed/15',
  wip: 'border-st-running/30 bg-st-running/10 text-st-running hover:bg-st-running/15',
}

function Tab({
  label,
  code,
  active,
  tone,
  ai,
  onClick,
}: {
  label: string
  code: string
  active: boolean
  tone: Tone
  ai?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex shrink-0 items-center gap-1.5 rounded-t-[8px] border border-b-0 px-3 py-2 transition-colors duration-150',
        active
          ? 'z-10 -mb-px border-line-strong bg-panel pb-[9px] text-text'
          : INACTIVE_TONE[tone],
      )}
    >
      {ai && <LightbulbFilamentIcon size={12} weight="fill" className="text-accent" aria-hidden />}
      <span className="text-[11px] opacity-70">{label}</span>
      <span className="num text-[12px] font-medium">{code}</span>
    </button>
  )
}

/* ------------------------------------------------------------ sheet tab --- */

function SheetTab({ sheetId, onAddWorkOrder }: { sheetId: string; onAddWorkOrder: () => void }) {
  const mes = useMes()
  const sheet = mes.jobSheet(sheetId)!
  const orders = mes.workOrdersFor(sheetId)
  const remaining = mes.remainingByGoal(sheetId)
  const locked = mes.jobSheetLocked(sheetId)

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_264px]">
          {/* ------------------------------------------------ left: identity --- */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="num text-[19px] font-semibold tracking-tight">{sheet.code}</h2>
              <JobSheetBadge status={sheet.status} />
            </div>
            <p className="mt-1 text-[13px] text-text-dim">
              {sheet.customer} <span className="text-text-faint">/</span>{' '}
              <span className="num">{sheet.reference}</span>{' '}
              <span className="text-text-faint">
                / raised by {sheet.createdBy} on {fmtDate(sheet.createdAt)}
              </span>
            </p>

            {sheet.rejectionReason && (
              <p className="mt-3 rounded-[6px] border border-st-stopped/40 bg-st-stopped/10 px-3 py-2 text-[12px] text-st-stopped">
                Returned by the production manager: {sheet.rejectionReason}
              </p>
            )}

            {/* ------------------------------------------------------- goals --- */}
            <h3 className="mt-5 text-[12px] font-semibold tracking-wide text-text-dim uppercase">
              Goal
            </h3>
            <div className="mt-2 overflow-hidden rounded-[6px] border border-line">
              <table className="w-full">
                <thead className="bg-panel-2/60">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left text-[11px] font-medium text-text-faint">
                      Item name
                    </th>
                    <th className="w-[104px] px-2.5 py-1.5 text-right text-[11px] font-medium text-text-faint">
                      Qty
                    </th>
                    <th className="w-[120px] px-2.5 py-1.5 text-right text-[11px] font-medium text-text-faint">
                      Still need
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sheet.goals.map((goal) => {
                    const left = remaining[goal.id] ?? 0
                    return (
                      <tr key={goal.id} className="hover:bg-panel-2/60">
                        <td className="px-2.5 py-2">
                          <div className="num text-[11px] text-text-faint">{goal.productCode}</div>
                          <div className="text-[13px]">{goal.productName}</div>
                        </td>
                        <td className="num px-2.5 py-2 text-right text-[13px]">
                          {fmtInt(goal.targetQty)}
                          <span className="ml-1 text-[11px] text-text-faint">{goal.unit}</span>
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          <span
                            className={cx(
                              'num text-[13px]',
                              left > 0
                                ? 'text-st-running'
                                : left < 0
                                  ? 'text-st-stopped'
                                  : 'text-st-confirmed',
                            )}
                          >
                            {fmtInt(left)}
                          </span>
                          <div className="text-[11px] text-text-faint">
                            {left > 0 ? 'not covered' : left < 0 ? 'over-produced' : 'fully covered'}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[12px] text-text-faint">
              {orders.length} work order{orders.length === 1 ? '' : 's'} on this sheet.
              {!locked && (
                <>
                  {' '}
                  <button onClick={onAddWorkOrder} className="text-accent hover:underline">
                    Add one by hand
                  </button>{' '}
                  or let the planner fill the sheet.
                </>
              )}
            </p>
          </div>

          {/* ------------------------------------------- right: confirm + due --- */}
          <div className="flex flex-col gap-3">
            <div className="rounded-[6px] border border-line bg-panel-2/40 p-3">
              <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">
                Confirm JobSheet
              </h3>

              <button
                onClick={() => mes.aiPlanJobSheet(sheet.id)}
                disabled={locked}
                title="Auto-plan every work order, BOM, route and machine slot"
                className={cx(
                  'group mt-2 flex w-full flex-col items-center gap-1.5 rounded-[6px] border border-dashed px-3 py-4 transition-colors duration-150',
                  locked
                    ? 'pointer-events-none border-line text-text-faint opacity-50'
                    : 'border-accent/50 bg-panel hover:border-accent hover:bg-accent-soft',
                )}
              >
                <LightbulbFilamentIcon
                  size={30}
                  weight="fill"
                  className="text-accent transition-transform duration-150 group-hover:scale-110"
                />
                <span className="text-[12px] font-medium text-accent">Auto-plan with AI</span>
                <span className="text-center text-[11px] leading-snug text-text-dim">
                  Work orders, BOM, route and machine slots for the whole sheet.
                </span>
              </button>

              <Button
                variant="primary"
                className="mt-2.5 w-full justify-center"
                disabled={locked}
                onClick={() => mes.confirmJobSheet(sheet.id)}
                icon={<CheckCircleIcon size={15} weight="bold" />}
              >
                Confirm job sheet
              </Button>
              <p className="mt-1.5 text-[11px] leading-snug text-text-faint">
                Confirming moves the sheet to pending and confirms every work order on it.
              </p>
            </div>

            <div className="rounded-[6px] border border-line p-3">
              <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">
                Due date
              </h3>
              <p className="num mt-1.5 flex items-center gap-1.5 text-[14px]">
                <CalendarBlankIcon size={15} weight="bold" className="text-text-faint" />
                {fmtDate(sheet.dueDate)}
              </p>
            </div>

            {locked && (
              <p className="flex items-start gap-2 rounded-[6px] border border-st-confirmed/35 bg-st-confirmed/10 px-2.5 py-2 text-[11px] leading-snug text-st-confirmed">
                <LockSimpleIcon size={14} weight="fill" className="mt-px shrink-0" />
                Confirmed and locked. Neither the sheet nor its work orders can be edited.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- footer --- */}
      <footer className="flex shrink-0 justify-center border-t border-line bg-panel-2/40 px-4 py-3">
        <Button
          className="min-w-[200px] justify-center"
          disabled={locked}
          onClick={() => mes.saveDraft(sheet.id)}
          icon={<FloppyDiskIcon size={15} weight="bold" />}
        >
          Save
        </Button>
      </footer>
    </>
  )
}
