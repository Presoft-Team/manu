import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon,
  BellRingingIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  InfoIcon,
  WarningCircleIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { EmptyState, Metric, PageHead, Panel, Tabs, cx } from '@/components/ui'
import { buildAlerts, machineLoad, plantKpis, rollupRuns, yieldOf } from '@/lib/analytics'
import { MACHINES } from '@/data/seed'
import { daysUntil, fmtDate, fmtInt, fmtMoney } from '@/lib/format'
import type { Alert, AlertLevel } from '@/lib/analytics'

/* How often the derived view refreshes itself. The floor moves in minutes. */
const TICK_MS = 30_000

const LEVEL: Record<
  AlertLevel,
  { label: string; badge: string; icon: typeof InfoIcon; iconTone: string }
> = {
  critical: {
    label: 'Critical',
    badge: 'text-st-stopped border-st-stopped/40 bg-st-stopped/10',
    icon: WarningOctagonIcon,
    iconTone: 'text-st-stopped',
  },
  warning: {
    label: 'Warning',
    badge: 'text-st-running border-st-running/40 bg-st-running/10',
    icon: WarningCircleIcon,
    iconTone: 'text-st-running',
  },
  info: {
    label: 'Info',
    badge: 'text-st-done border-st-done/35 bg-st-done/10',
    icon: InfoIcon,
    iconTone: 'text-st-done',
  },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { jobSheets, workOrders, staffRuns } = useMes()
  const [now, setNow] = useState(() => new Date())
  const [level, setLevel] = useState<'all' | AlertLevel>('all')

  /* Elapsed-time figures go stale on their own, so the page re-derives on a timer. */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(t)
  }, [])

  /* `now` is a deliberate dependency: it is what makes the clock-based figures move. */
  const kpis = useMemo(
    () => plantKpis(jobSheets, workOrders, staffRuns),
    [jobSheets, workOrders, staffRuns, now],
  )

  const alerts = useMemo(
    () => buildAlerts(jobSheets, workOrders, staffRuns),
    [jobSheets, workOrders, staffRuns, now],
  )

  const counts = {
    critical: alerts.filter((a) => a.level === 'critical').length,
    warning: alerts.filter((a) => a.level === 'warning').length,
    info: alerts.filter((a) => a.level === 'info').length,
  }
  const shown = level === 'all' ? alerts : alerts.filter((a) => a.level === level)

  const load = useMemo(() => machineLoad(workOrders, MACHINES).filter((m) => m.slots.length), [workOrders])
  const maxHours = Math.max(1, ...load.map((m) => m.hours))

  const late = jobSheets
    .filter((s) => s.status !== 'completed' && daysUntil(s.dueDate) <= 3)
    .sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate))

  const onFloor = workOrders.filter((w) => ['running', 'stopped', 'released'].includes(w.status))

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Plant dashboard"
        blurb="Live state of the floor: what is running, what is late, and what needs a person right now. Every figure is derived from the job sheets, work orders and operator runs underneath it."
      >
        <div className="flex items-center gap-1.5 rounded-[6px] border border-line bg-panel px-3 py-1.5">
          <span className="relative flex size-1.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
          </span>
          <span className="num text-[12px] text-text-dim">
            live · {now.toLocaleTimeString('en-MY', { hour12: false })}
          </span>
        </div>
      </PageHead>

      {/* ------------------------------------------------------------ KPIs --- */}
      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <Metric
            label="Open job sheets"
            value={fmtInt(kpis.openSheets)}
            dot="bg-st-draft"
            hint={`${fmtInt(kpis.lateSheets)} past due`}
          />
          <Metric
            label="On the floor"
            value={fmtInt(kpis.ordersOnFloor)}
            dot="bg-st-confirmed"
            hint={`${fmtInt(kpis.running)} running, ${fmtInt(kpis.stopped)} stopped`}
          />
          <Metric
            label="Operators active"
            value={fmtInt(kpis.operatorsActive)}
            dot="bg-st-running"
            hint={`${fmtInt(Math.round(kpis.workedMin / 60))} h clocked`}
          />
          <Metric
            label="Good units"
            value={fmtInt(kpis.done)}
            tone="text-st-done"
            dot="bg-st-done"
            hint={`${fmtInt(kpis.rosak)} rosak, ${fmtInt(kpis.waste)} waste`}
          />
          <Metric
            label="Yield"
            value={`${kpis.yieldPct}%`}
            tone={kpis.yieldPct < 95 ? 'text-st-running' : 'text-st-done'}
            hint="good over produced"
          />
          <Metric
            label="Availability"
            value={`${kpis.availabilityPct}%`}
            tone={kpis.availabilityPct < 90 ? 'text-st-running' : undefined}
            hint={`${fmtInt(kpis.downtimeMin)} min downtime`}
          />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* -------------------------------------------------------- alerts --- */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <BellRingingIcon size={14} weight="fill" className="text-accent" />
              Alerts &amp; notifications
            </span>
          }
          action={
            <Tabs
              active={level}
              onChange={setLevel}
              tabs={[
                { key: 'all', label: 'All', count: alerts.length },
                { key: 'critical', label: 'Critical', count: counts.critical },
                { key: 'warning', label: 'Warning', count: counts.warning },
                { key: 'info', label: 'Info', count: counts.info },
              ]}
            />
          }
        >
          {shown.length === 0 ? (
            <EmptyState
              icon={<CheckCircleIcon size={30} weight="light" />}
              title="Nothing to escalate"
              body="No stopped lines, no shortages, no overdue sheets. Alerts appear here the moment a condition trips and clear themselves when it is resolved."
            />
          ) : (
            <ul className="max-h-[520px] overflow-y-auto">
              {shown.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onOpen={() => navigate(alert.to)} />
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          {/* ------------------------------------------------------ delays --- */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <ClockCountdownIcon size={14} weight="fill" className="text-st-stopped" />
                Delivery risk
              </span>
            }
          >
            {late.length === 0 ? (
              <EmptyState
                icon={<CheckCircleIcon size={28} weight="light" />}
                title="Nothing due inside three days"
                body="Sheets appear here as their due date approaches, and turn red once they pass it."
              />
            ) : (
              <ul>
                {late.map((sheet) => {
                  const days = daysUntil(sheet.dueDate)
                  return (
                    <li key={sheet.id} className="border-b border-line last:border-b-0">
                      <button
                        onClick={() => navigate(`/job-sheets/${sheet.id}`)}
                        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-panel-2"
                      >
                        <span
                          className={cx(
                            'size-1.5 shrink-0 rounded-full',
                            days < 0 ? 'bg-st-stopped' : 'bg-st-running',
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="num block text-[13px] font-medium group-hover:text-accent">
                            {sheet.code}
                          </span>
                          <span className="block truncate text-[12px] text-text-faint">
                            {sheet.customer}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span
                            className={cx(
                              'num block text-[13px]',
                              days < 0 ? 'text-st-stopped' : 'text-st-running',
                            )}
                          >
                            {days < 0 ? `${Math.abs(days)}d late` : `in ${days}d`}
                          </span>
                          <span className="num block text-[12px] text-text-faint">
                            {fmtDate(sheet.dueDate)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {/* ------------------------------------------------ machine load --- */}
          <Panel title="Machine load, open orders">
            {load.length === 0 ? (
              <EmptyState
                icon={<ClockCountdownIcon size={28} weight="light" />}
                title="No machine booked"
                body="Slots appear here once the planner schedules a work order."
              />
            ) : (
              <ul className="flex flex-col gap-2 px-3 py-3">
                {load.map((m) => (
                  <li key={m.machine}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="num truncate text-[12px]">{m.machine}</span>
                      <span className="num shrink-0 text-[12px] text-text-faint">{m.hours} h</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-300"
                        style={{ width: `${Math.round((m.hours / maxHours) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* --------------------------------------------------- floor progress --- */}
      <Panel title={`Progress on the floor (${onFloor.length})`}>
        {onFloor.length === 0 ? (
          <EmptyState
            icon={<CheckCircleIcon size={30} weight="light" />}
            title="Nothing released"
            body="Approving a job sheet releases its work orders to the floor, and they show their progress here."
          />
        ) : (
          <ul>
            {onFloor.map((wo) => {
              const runs = staffRuns.filter((r) => r.workOrderId === wo.id)
              const t = rollupRuns(runs)
              const pct = wo.qty ? Math.min(100, Math.round((t.done / wo.qty) * 100)) : 0
              const y = yieldOf(t)
              return (
                <li key={wo.id} className="border-b border-line last:border-b-0">
                  <button
                    onClick={() => navigate(`/wip/${wo.id}`)}
                    className="group flex w-full items-center gap-4 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-panel-2"
                  >
                    <div className="w-[150px] shrink-0">
                      <div className="num text-[13px] font-medium group-hover:text-accent">
                        {wo.code}
                      </div>
                      <div className="num mt-0.5 truncate text-[12px] text-text-faint">
                        {wo.slot?.machine ?? 'no machine'}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="num text-[12px] text-text-dim">
                          {fmtInt(t.done)} / {fmtInt(wo.qty)} {wo.unit}
                        </span>
                        <span className="num text-[12px] text-text-faint">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
                        <div
                          className={cx(
                            'h-full rounded-full transition-all duration-300',
                            wo.status === 'stopped' ? 'bg-st-stopped' : 'bg-st-done',
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="hidden w-[92px] text-right sm:block">
                      <div
                        className={cx('num text-[13px]', y && y < 95 ? 'text-st-running' : 'text-text-dim')}
                      >
                        {y ? `${y}%` : '—'}
                      </div>
                      <div className="text-[12px] text-text-faint">yield</div>
                    </div>

                    <ArrowRightIcon
                      size={14}
                      weight="bold"
                      className="shrink-0 text-text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <p className="text-[12px] text-text-faint">
        Planned cost across every work order {fmtMoney(kpis.plannedCost)} · actual to date{' '}
        {fmtMoney(kpis.actualCost)}. Actuals are costed in Quality control.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------ alert row --- */

function AlertRow({ alert, onOpen }: { alert: Alert; onOpen: () => void }) {
  const meta = LEVEL[alert.level]
  const Icon = meta.icon

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        onClick={onOpen}
        className="group flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-panel-2"
      >
        <Icon size={15} weight="fill" className={cx('mt-0.5 shrink-0', meta.iconTone)} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium group-hover:text-accent">{alert.title}</div>
          <div className="mt-0.5 text-[12px] text-text-dim">{alert.detail}</div>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[12px] leading-none font-medium',
            meta.badge,
          )}
        >
          {meta.label}
        </span>
      </button>
    </li>
  )
}
