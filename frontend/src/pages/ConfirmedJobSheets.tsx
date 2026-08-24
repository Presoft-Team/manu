import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUUpLeftIcon, CheckCircleIcon, SealCheckIcon } from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { Button, EmptyState, JobSheetBadge, Metric, Panel, cx } from '@/components/ui'
import { fmtDate, fmtInt } from '@/lib/format'
import type { JobSheetStatus } from '@/types'

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

  const confirmed = mes.jobSheets.filter((s) => s.status !== 'draft')
  const rows = filter === 'all' ? confirmed : confirmed.filter((s) => s.status === filter)

  const countOf = (status: JobSheetStatus) => confirmed.filter((s) => s.status === status).length

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Confirmed job sheets</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Locked sheets moving through approval, release and production. Open one to read it, not to
          edit it.
        </p>
      </div>

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line md:grid-cols-4">
          <Metric label="Pending approval" value={fmtInt(countOf('pending_approval'))} />
          <Metric label="Approved" value={fmtInt(countOf('approved'))} />
          <Metric label="In progress" value={fmtInt(countOf('in_progress'))} />
          <Metric label="Completed" value={fmtInt(countOf('completed'))} />
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
              return (
                <li
                  key={sheet.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-3 last:border-b-0 hover:bg-panel-2"
                >
                  <button
                    onClick={() => navigate(`/job-sheets/${sheet.id}`)}
                    className="flex min-w-[168px] flex-col items-start text-left"
                  >
                    <span className="num text-[13px] font-medium hover:text-accent">{sheet.code}</span>
                    <span className="mt-0.5 num text-[11px] text-text-faint">{sheet.reference}</span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{sheet.customer}</div>
                    <div className="mt-0.5 truncate text-[11px] text-text-faint">
                      {sheet.goals.map((g) => g.productName).join(' / ')}
                    </div>
                  </div>

                  <div className="hidden w-[104px] text-right lg:block">
                    <div className="num text-[13px]">{fmtInt(targetQty)}</div>
                    <div className="text-[11px] text-text-faint">target qty</div>
                  </div>

                  <div className="hidden w-[92px] text-right sm:block">
                    <div className="num text-[13px]">{orders.length}</div>
                    <div className="text-[11px] text-text-faint">work orders</div>
                  </div>

                  <div className="w-[112px] text-right">
                    <div className="num text-[13px]">{fmtDate(sheet.dueDate)}</div>
                    <div className="text-[11px] text-text-faint">due</div>
                  </div>

                  <div className="flex w-[224px] items-center justify-end gap-2">
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
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
