import { useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon,
  FileDashedIcon,
  LightbulbFilamentIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { EmptyState, JobSheetBadge, Metric, Panel, cx } from '@/components/ui'
import { daysUntil, fmtDate, fmtInt } from '@/lib/format'
import type { DemandSource } from '@/types'

const SOURCE_LABEL: Record<DemandSource, string> = {
  sales_order: 'Sales order',
  forecast: 'Forecast',
  rework: 'Rework',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { jobSheets, workOrders, workOrdersFor } = useMes()

  const drafts = jobSheets.filter((s) => s.status === 'draft')
  const draftWorkOrders = workOrders.filter(
    (w) => w.status === 'draft' && drafts.some((s) => s.id === w.jobSheetId),
  )
  const shortages = draftWorkOrders.filter((w) => w.feasibility === 'shortage')
  const dueSoon = drafts.filter((s) => daysUntil(s.dueDate) <= 14)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Draft job sheets</h1>
          <p className="mt-0.5 text-[13px] text-text-dim">
            Demand from sales orders and forecast, waiting to be split into work orders.
          </p>
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line md:grid-cols-4">
          <Metric label="Open drafts" value={fmtInt(drafts.length)} />
          <Metric label="Work orders in draft" value={fmtInt(draftWorkOrders.length)} />
          <Metric
            label="Material shortages"
            value={fmtInt(shortages.length)}
            tone={shortages.length ? 'text-st-stopped' : undefined}
            hint={shortages.length ? 'Purchase requests raised' : 'All lines covered'}
          />
          <Metric label="Due within 14 days" value={fmtInt(dueSoon.length)} />
        </div>
      </Panel>

      <Panel title={`Drafts (${drafts.length})`}>
        {drafts.length === 0 ? (
          <EmptyState
            icon={<FileDashedIcon size={30} weight="light" />}
            title="No draft job sheets"
            body="New sales orders and forecast runs land here as drafts before anyone splits them into work orders."
          />
        ) : (
          <ul>
            {drafts.map((sheet) => {
              const orders = workOrdersFor(sheet.id)
              const confirmed = orders.filter((w) => w.status !== 'draft').length
              const hasShortage = orders.some((w) => w.feasibility === 'shortage')
              const aiBuilt = orders.some((w) => w.mode === 'ai')
              const days = daysUntil(sheet.dueDate)
              const targetQty = sheet.goals.reduce((sum, g) => sum + g.targetQty, 0)

              return (
                <li key={sheet.id} className="border-b border-line last:border-b-0">
                  <button
                    onClick={() => navigate(`/job-sheets/${sheet.id}`)}
                    className="group flex w-full items-center gap-4 px-3 py-3 text-left transition-colors duration-150 hover:bg-panel-2"
                  >
                    <div className="min-w-[168px]">
                      <div className="flex items-center gap-1.5">
                        <span className="num text-[13px] font-medium">{sheet.code}</span>
                        {aiBuilt && (
                          <LightbulbFilamentIcon
                            size={14}
                            weight="fill"
                            className="text-accent"
                            aria-label="Contains AI-assigned work orders"
                          />
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-text-faint">
                        {SOURCE_LABEL[sheet.source]} <span className="num">{sheet.reference}</span>
                      </div>
                    </div>

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

                    <div className="hidden w-[112px] text-right sm:block">
                      <div className="num text-[13px]">
                        {confirmed}/{orders.length}
                      </div>
                      <div className="text-[11px] text-text-faint">WO confirmed</div>
                    </div>

                    <div className="w-[112px] text-right">
                      <div
                        className={cx(
                          'num text-[13px]',
                          days < 7 ? 'text-st-stopped' : 'text-text',
                        )}
                      >
                        {fmtDate(sheet.dueDate)}
                      </div>
                      <div className="text-[11px] text-text-faint">
                        {days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                      </div>
                    </div>

                    <div className="flex w-[172px] items-center justify-end gap-2">
                      {hasShortage && (
                        <WarningOctagonIcon
                          size={15}
                          weight="fill"
                          className="text-st-stopped"
                          aria-label="Material shortage"
                        />
                      )}
                      <JobSheetBadge status={sheet.status} />
                      <ArrowRightIcon
                        size={14}
                        weight="bold"
                        className="text-text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
                      />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
