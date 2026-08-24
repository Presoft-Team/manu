import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  FloppyDiskIcon,
  LightbulbFilamentIcon,
  LockSimpleIcon,
  PlusIcon,
  StackIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { NewWorkOrderDialog } from '@/components/NewWorkOrderDialog'
import { WorkOrderEditor } from '@/components/WorkOrderEditor'
import { Button, EmptyState, JobSheetBadge, Panel, cx } from '@/components/ui'
import { fmtDate, fmtInt } from '@/lib/format'

export default function JobSheetEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const mes = useMes()

  const sheet = mes.jobSheet(id)
  const orders = mes.workOrdersFor(id)
  const locked = mes.jobSheetLocked(id)
  const remaining = mes.remainingByGoal(id)

  const [activeId, setActiveId] = useState<string | null>(orders[0]?.id ?? null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Keep the active tab valid when orders are added or closed.
  useEffect(() => {
    if (orders.length === 0) {
      if (activeId !== null) setActiveId(null)
      return
    }
    if (!activeId || !orders.some((o) => o.id === activeId)) setActiveId(orders[0].id)
  }, [orders, activeId])

  if (!sheet) {
    return (
      <EmptyState
        icon={<StackIcon size={30} weight="light" />}
        title="Job sheet not found"
        body="This job sheet is not in the current data set."
        action={<Button onClick={() => navigate('/')}>Back to drafts</Button>}
      />
    )
  }

  const active = orders.find((o) => o.id === activeId) ?? null
  const draftCount = orders.filter((o) => o.status === 'draft').length

  return (
    <div className="flex flex-col gap-4">
      {/* ----------------------------------------------------- sheet head --- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={locked ? '/confirmed' : '/'}
            className="inline-flex items-center gap-1.5 text-[12px] text-text-dim hover:text-accent"
          >
            <ArrowLeftIcon size={13} weight="bold" />
            {locked ? 'Confirmed job sheets' : 'Draft job sheets'}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="num text-[20px] font-semibold tracking-tight">{sheet.code}</h1>
            <JobSheetBadge status={sheet.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-text-dim">
            {sheet.customer} <span className="text-text-faint">/</span>{' '}
            <span className="num">{sheet.reference}</span>{' '}
            <span className="text-text-faint">/ due {fmtDate(sheet.dueDate)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => mes.saveDraft(sheet.id)}
            disabled={locked}
            icon={<FloppyDiskIcon size={15} weight="bold" />}
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            onClick={() => mes.confirmJobSheet(sheet.id)}
            disabled={locked}
            icon={<CheckCircleIcon size={15} weight="bold" />}
          >
            Confirm job sheet
          </Button>
        </div>
      </div>

      {locked && (
        <p className="flex items-center gap-2 rounded-[6px] border border-st-confirmed/35 bg-st-confirmed/10 px-3 py-2 text-[13px] text-st-confirmed">
          <LockSimpleIcon size={15} weight="fill" className="shrink-0" />
          This job sheet is confirmed and locked. Neither the sheet nor its work orders can be edited.
        </p>
      )}

      {sheet.rejectionReason && (
        <p className="rounded-[6px] border border-st-stopped/40 bg-st-stopped/10 px-3 py-2 text-[13px] text-st-stopped">
          Returned by the production manager: {sheet.rejectionReason}
        </p>
      )}

      {/* --------------------------------------------- remaining goal qty --- */}
      <Panel title="Goal quantities">
        <ul className="divide-y divide-line">
          {sheet.goals.map((goal) => {
            const left = remaining[goal.id] ?? 0
            const covered = goal.targetQty - left
            const pct = goal.targetQty ? Math.min(100, Math.round((covered / goal.targetQty) * 100)) : 0
            return (
              <li key={goal.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                <div className="min-w-[220px] flex-1">
                  <div className="num text-[12px] text-text-dim">{goal.productCode}</div>
                  <div className="text-[13px]">{goal.productName}</div>
                </div>
                <div className="w-[120px] text-right">
                  <div className="num text-[13px]">{fmtInt(goal.targetQty)}</div>
                  <div className="text-[11px] text-text-faint">target {goal.unit}</div>
                </div>
                <div className="w-[120px] text-right">
                  <div className="num text-[13px]">{fmtInt(covered)}</div>
                  <div className="text-[11px] text-text-faint">covered ({pct}%)</div>
                </div>
                <div className="w-[120px] text-right">
                  <div
                    className={cx(
                      'num text-[13px]',
                      left > 0 ? 'text-st-running' : left < 0 ? 'text-st-stopped' : 'text-st-done',
                    )}
                  >
                    {fmtInt(left)}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {left < 0 ? 'over-produced' : 'remaining'}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </Panel>

      {/* ------------------------------------------------------------ tabs --- */}
      <div>
        <div className="flex items-end gap-1 overflow-x-auto border-b border-line pt-1">
          {orders.map((wo) => {
            const isActive = wo.id === activeId
            const woLocked = wo.status !== 'draft'
            return (
              <div
                key={wo.id}
                className={cx(
                  'group relative flex shrink-0 items-center rounded-t-[8px] border border-b-0 transition-colors duration-150',
                  isActive
                    ? 'z-10 -mb-px border-line bg-panel pb-px'
                    : 'border-transparent bg-panel-2 hover:bg-panel',
                )}
              >
                <button
                  onClick={() => setActiveId(wo.id)}
                  className="flex items-center gap-1.5 py-2 pr-2 pl-3"
                  aria-current={isActive ? 'page' : undefined}
                >
                  {wo.mode === 'ai' ? (
                    <LightbulbFilamentIcon
                      size={13}
                      weight="fill"
                      className={isActive ? 'text-accent' : 'text-text-faint'}
                      aria-label="AI assigned"
                    />
                  ) : (
                    <span
                      className={cx(
                        'size-1.5 rounded-full',
                        woLocked ? 'bg-st-confirmed' : 'bg-st-draft',
                      )}
                      aria-hidden
                    />
                  )}
                  <span
                    className={cx(
                      'num text-[12px]',
                      isActive ? 'font-medium text-text' : 'text-text-dim',
                    )}
                  >
                    {wo.code}
                  </span>
                  {woLocked && (
                    <LockSimpleIcon
                      size={11}
                      weight="fill"
                      className="text-text-faint"
                      aria-label="Locked"
                    />
                  )}
                </button>
                {!locked && !woLocked && (
                  <button
                    onClick={() => mes.removeWorkOrder(wo.id)}
                    className="mr-1.5 rounded-[4px] p-0.5 text-text-faint opacity-0 hover:bg-panel-2 hover:text-st-stopped group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Close ${wo.code}`}
                  >
                    <XIcon size={11} weight="bold" />
                  </button>
                )}
              </div>
            )
          })}

          {!locked && (
            <button
              onClick={() => setDialogOpen(true)}
              className="mb-1 ml-1 shrink-0 rounded-[6px] p-1.5 text-text-dim transition-colors duration-150 hover:bg-panel-2 hover:text-accent"
              aria-label="Add work order"
              title="Add work order"
            >
              <PlusIcon size={14} weight="bold" />
            </button>
          )}

          <span className="ml-auto shrink-0 pr-2 pb-2 text-[11px] text-text-faint">
            {orders.length} work order{orders.length === 1 ? '' : 's'}
            {draftCount > 0 && `, ${draftCount} in draft`}
          </span>
        </div>

        <div className="pt-4">
          {active ? (
            <WorkOrderEditor wo={active} sheet={sheet} />
          ) : (
            <Panel>
              <EmptyState
                icon={<StackIcon size={30} weight="light" />}
                title="No work orders on this job sheet"
                body="Split the goal quantities into work orders. Each one opens as its own tab and can be built by AI or by hand."
                action={
                  !locked && (
                    <Button
                      variant="primary"
                      onClick={() => setDialogOpen(true)}
                      icon={<PlusIcon size={15} weight="bold" />}
                    >
                      Add work order
                    </Button>
                  )
                }
              />
            </Panel>
          )}
        </div>
      </div>

      {dialogOpen && (
        <NewWorkOrderDialog
          sheet={sheet}
          onClose={() => setDialogOpen(false)}
          onCreated={setActiveId}
        />
      )}
    </div>
  )
}
