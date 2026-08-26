import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRightIcon,
  DeviceTabletIcon,
  FactoryIcon,
  PhoneCallIcon,
  TimerIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import {
  Button,
  EmptyState,
  Metric,
  Panel,
  RunBadge,
  WorkOrderBadge,
  cx,
} from '@/components/ui'
import { fmtDateTime, fmtInt, fmtSpan, fmtTime } from '@/lib/format'
import type { StaffRun, WorkOrder } from '@/types'

const cell = 'px-2.5 py-2 text-[13px]'
const head = 'px-2.5 py-1.5 text-left text-[12px] font-medium text-text-faint'

/** Work orders that have reached the floor. Draft and confirmed-but-unreleased are excluded. */
const ON_FLOOR = new Set(['released', 'running', 'stopped', 'completed'])

function rollup(runs: StaffRun[]) {
  return runs.reduce(
    (acc, r) => ({
      done: acc.done + r.qtyDone,
      rosak: acc.rosak + r.qtyRosak,
      waste: acc.waste + r.qtyWaste,
      downtimeMin: acc.downtimeMin + r.downtimeMin,
    }),
    { done: 0, rosak: 0, waste: 0, downtimeMin: 0 },
  )
}

export default function WipWorkOrders() {
  const { workOrderId } = useParams()
  const navigate = useNavigate()
  const mes = useMes()
  /*
    Floor mode: this screen also lives on a tablet next to a machine. Bigger type,
    48px touch targets, and forced dark to cut glare in a dim or dusty bay. Opt-in
    rather than automatic, because the same screen is read at a desk.
  */
  const [floorMode, setFloorMode] = useState(false)

  const floor = mes.workOrders.filter((w) => ON_FLOOR.has(w.status))
  const selected = floor.find((w) => w.id === workOrderId) ?? null

  const totals = rollup(mes.staffRuns.filter((r) => floor.some((w) => w.id === r.workOrderId)))
  const activeOperators = mes.staffRuns.filter((r) => r.status === 'running').length

  return (
    <div
      className={cx(
        'flex flex-col gap-5 transition-all duration-300 ease-spring',
        floorMode && 'floor dark -mx-4 rounded-[6px] bg-surface px-4 py-4',
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-gradient text-[20px] font-semibold tracking-tight">
            Work in progress
          </h1>
          <p className="mt-0.5 text-[13px] text-text-dim">
            Released work orders on the floor. Open one to see who ran it and what came off the
            machine.
          </p>
        </div>
        <Button
          variant={floorMode ? 'primary' : 'secondary'}
          onClick={() => setFloorMode((f) => !f)}
          aria-pressed={floorMode}
          icon={<DeviceTabletIcon size={15} weight="bold" />}
        >
          {floorMode ? 'Floor mode on' : 'Floor mode'}
        </Button>
      </div>

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line md:grid-cols-4">
          <Metric label="Orders on the floor" value={fmtInt(floor.length)} dot="bg-st-confirmed" />
          <Metric
            label="Operators clocked in"
            value={fmtInt(activeOperators)}
            dot="bg-st-running"
          />
          <Metric
            label="Good units today"
            value={fmtInt(totals.done)}
            tone="text-st-done"
            dot="bg-st-done"
          />
          <Metric
            label="Rosak units"
            value={fmtInt(totals.rosak)}
            tone={totals.rosak ? 'text-st-stopped' : undefined}
            dot="bg-st-stopped"
            hint={`${fmtInt(totals.waste)} waste, ${fmtInt(totals.downtimeMin)} min downtime`}
          />
        </div>
      </Panel>

      <Panel title={`Work orders (${floor.length})`}>
        {floor.length === 0 ? (
          <EmptyState
            icon={<FactoryIcon size={30} weight="light" />}
            title="Nothing on the floor"
            body="Approving a job sheet soft-reserves stock and releases its work orders here."
          />
        ) : (
          <ul>
            {floor.map((wo) => (
              <WorkOrderRow
                key={wo.id}
                wo={wo}
                active={wo.id === workOrderId}
                onOpen={() => navigate(wo.id === workOrderId ? '/wip' : `/wip/${wo.id}`)}
              />
            ))}
          </ul>
        )}
      </Panel>

      {selected ? (
        <StaffWip wo={selected} />
      ) : (
        floor.length > 0 && (
          <Panel>
            <EmptyState
              icon={<UsersThreeIcon size={30} weight="light" />}
              title="No work order selected"
              body="Pick a work order above to see its staff WIP: who ran each operation, and the good, rosak and waste quantities they recorded."
            />
          </Panel>
        )
      )}
    </div>
  )
}

function WorkOrderRow({
  wo,
  active,
  onOpen,
}: {
  wo: WorkOrder
  active: boolean
  onOpen: () => void
}) {
  const mes = useMes()
  const sheet = mes.jobSheet(wo.jobSheetId)
  const runs = mes.staffRunsFor(wo.id)
  const t = rollup(runs)
  const pct = wo.qty ? Math.min(100, Math.round((t.done / wo.qty) * 100)) : 0

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        onClick={onOpen}
        className={cx(
          'group flex w-full items-center gap-4 px-3 py-3 text-left transition-colors duration-150',
          active ? 'bg-accent-soft/60' : 'hover:bg-panel-2',
        )}
      >
        <div className="min-w-[160px]">
          <div className="num text-[13px] font-medium">{wo.code}</div>
          <div className="num mt-0.5 text-[12px] text-text-faint">{sheet?.code}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px]">{wo.route[0]?.operation ?? 'No route'}</div>
          <div className="num mt-0.5 truncate text-[12px] text-text-faint">
            {wo.slot?.machine ?? 'Machine not assigned'}
          </div>
        </div>

        <div className="hidden w-[150px] sm:block">
          <div className="num text-[12px]">
            {fmtInt(t.done)} / {fmtInt(wo.qty)} {wo.unit}
          </div>
          {/* Progress reads as a share of the order, so the track is meaningful here. */}
          <div className="mt-1 h-1 w-full rounded-full bg-line">
            <div
              className={cx('h-1 rounded-full', wo.status === 'stopped' ? 'bg-st-stopped' : 'bg-st-done')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="hidden w-[88px] text-right md:block">
          <div className={cx('num text-[13px]', t.rosak ? 'text-st-stopped' : 'text-text-dim')}>
            {fmtInt(t.rosak)}
          </div>
          <div className="text-[12px] text-text-faint">rosak</div>
        </div>

        <div className="hidden w-[88px] text-right md:block">
          <div className="num text-[13px] text-text-dim">{runs.length}</div>
          <div className="text-[12px] text-text-faint">operators</div>
        </div>

        <div className="flex w-[140px] items-center justify-end gap-2">
          <WorkOrderBadge status={wo.status} />
          <ArrowRightIcon
            size={14}
            weight="bold"
            className={cx(
              'transition-transform duration-150',
              active ? 'rotate-90 text-accent' : 'text-text-faint group-hover:text-accent',
            )}
          />
        </div>
      </button>
    </li>
  )
}

function StaffWip({ wo }: { wo: WorkOrder }) {
  const mes = useMes()
  const runs = mes.staffRunsFor(wo.id)
  const t = rollup(runs)
  const produced = t.done + t.rosak
  const yieldPct = produced ? Math.round((t.done / produced) * 1000) / 10 : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="num">{wo.code}</span>
          <span className="text-text-faint">staff WIP</span>
        </h2>
        <span className="num text-[12px] text-text-faint">
          {mes.jobSheet(wo.jobSheetId)?.code} · {wo.slot?.machine ?? 'no machine assigned'}
        </span>
      </div>

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-5 md:divide-y-0">
          <Metric
            label="Quantity done"
            value={fmtInt(t.done)}
            tone="text-st-done"
            hint={`of ${fmtInt(wo.qty)} ${wo.unit} ordered`}
          />
          <Metric
            label="Rosak"
            value={fmtInt(t.rosak)}
            tone={t.rosak ? 'text-st-stopped' : undefined}
            hint="defective units"
          />
          <Metric label="Waste" value={fmtInt(t.waste)} hint="unrecoverable material" />
          <Metric
            label="Yield"
            value={`${yieldPct}%`}
            tone={yieldPct < 95 ? 'text-st-running' : 'text-st-done'}
            hint="good over produced"
          />
          <Metric
            label="Downtime"
            value={`${fmtInt(t.downtimeMin)} min`}
            hint={`across ${runs.length} run${runs.length === 1 ? '' : 's'}`}
          />
        </div>
      </Panel>

      <Panel title="Operator runs">
        {runs.length === 0 ? (
          <EmptyState
            icon={<TimerIcon size={30} weight="light" />}
            title="No runs recorded"
            body="This work order is released but no operator has tapped START on the shop floor terminal yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={head}>Operator</th>
                  <th className={cx(head, 'w-[56px]')}>Shift</th>
                  <th className={head}>Operation</th>
                  <th className={cx(head, 'w-[186px]')}>Window</th>
                  <th className={cx(head, 'w-[84px] text-right')}>Done</th>
                  <th className={cx(head, 'w-[84px] text-right')}>Rosak</th>
                  <th className={cx(head, 'w-[84px] text-right')}>Waste</th>
                  <th className={cx(head, 'w-[104px] text-right')}>Downtime</th>
                  <th className={cx(head, 'w-[104px]')}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((run) => (
                  <tr key={run.id} className="align-top hover:bg-panel-2">
                    <td className={cell}>
                      <div>{run.operatorName}</div>
                      <div className="num mt-0.5 text-[12px] text-text-faint">{run.operatorId}</div>
                    </td>
                    <td className={cx(cell, 'num text-text-dim')}>{run.shift}</td>
                    <td className={cell}>
                      <div>{run.operation}</div>
                      <div className="num mt-0.5 text-[12px] text-text-faint">{run.machine}</div>
                    </td>
                    <td className={cx(cell, 'num text-text-dim')}>
                      <div>
                        {fmtDateTime(run.startedAt)} to{' '}
                        {run.endedAt ? fmtTime(run.endedAt) : 'open'}
                      </div>
                      <div className="mt-0.5 text-[12px] text-text-faint">
                        {fmtSpan(run.startedAt, run.endedAt)} elapsed
                      </div>
                    </td>
                    <td className={cx(cell, 'num text-right text-st-done')}>{fmtInt(run.qtyDone)}</td>
                    <td
                      className={cx(
                        cell,
                        'num text-right',
                        run.qtyRosak ? 'text-st-stopped' : 'text-text-dim',
                      )}
                    >
                      {fmtInt(run.qtyRosak)}
                    </td>
                    <td className={cx(cell, 'num text-right text-text-dim')}>{fmtInt(run.qtyWaste)}</td>
                    <td className={cx(cell, 'text-right')}>
                      <div className="num text-text-dim">{fmtInt(run.downtimeMin)} min</div>
                      {run.downtimeReason && (
                        <div className="mt-0.5 text-[12px] text-text-faint">{run.downtimeReason}</div>
                      )}
                    </td>
                    <td className={cell}>
                      <div className="flex flex-col items-start gap-1">
                        <RunBadge status={run.status} />
                        {run.supervisorCalled && (
                          <span className="flex items-center gap-1 text-[12px] text-st-stopped">
                            <PhoneCallIcon size={11} weight="fill" />
                            supervisor called
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line-strong">
                <tr>
                  <td className={cx(cell, 'text-[12px] text-text-dim')} colSpan={4}>
                    Total across {runs.length} run{runs.length === 1 ? '' : 's'}
                  </td>
                  <td className={cx(cell, 'num text-right font-medium text-st-done')}>
                    {fmtInt(t.done)}
                  </td>
                  <td
                    className={cx(
                      cell,
                      'num text-right font-medium',
                      t.rosak ? 'text-st-stopped' : '',
                    )}
                  >
                    {fmtInt(t.rosak)}
                  </td>
                  <td className={cx(cell, 'num text-right font-medium')}>{fmtInt(t.waste)}</td>
                  <td className={cx(cell, 'num text-right font-medium')}>
                    {fmtInt(t.downtimeMin)} min
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
