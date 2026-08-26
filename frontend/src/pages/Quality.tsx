import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  SealCheckIcon,
  TrashIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import {
  Badge,
  Button,
  EmptyState,
  Metric,
  PageHead,
  Panel,
  Tabs,
  cx,
  inputClass,
} from '@/components/ui'
import { actualCost, belowTarget, rollupRuns, yieldOf } from '@/lib/analytics'
import { YIELD_TARGET_PCT } from '@/lib/rates'
import { fmtDateTime, fmtInt, fmtMoney } from '@/lib/format'
import type { QcDecision, WorkOrder } from '@/types'

const cell = 'px-2.5 py-2 text-[13px]'
const head = 'px-2.5 py-1.5 text-left text-[12px] font-medium text-text-faint'

const DECISION: Record<QcDecision, { label: string; tone: string }> = {
  accepted: { label: 'Accepted', tone: 'text-st-confirmed border-st-confirmed/35 bg-st-confirmed/10' },
  rework: { label: 'Sent for rework', tone: 'text-st-hold border-st-hold/45 bg-st-hold/10' },
  scrapped: { label: 'Scrapped', tone: 'text-st-stopped border-st-stopped/40 bg-st-stopped/10' },
}

export default function Quality() {
  const mes = useMes()
  const { workOrders, staffRuns } = mes
  const [view, setView] = useState<'pending' | 'closed'>('pending')

  /* Anything the floor has actually produced is inspectable, verdict or not. */
  const inspectable = useMemo(
    () =>
      workOrders
        .filter((w) => staffRuns.some((r) => r.workOrderId === w.id))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [workOrders, staffRuns],
  )

  const pending = inspectable.filter((w) => !w.qc)
  const closed = inspectable.filter((w) => w.qc)
  const shown = view === 'pending' ? pending : closed

  const totals = rollupRuns(staffRuns.filter((r) => inspectable.some((w) => w.id === r.workOrderId)))
  const overallYield = yieldOf(totals)

  const costs = inspectable.map((wo) =>
    actualCost(
      wo,
      staffRuns.filter((r) => r.workOrderId === wo.id),
    ),
  )
  const actualTotal = costs.reduce((sum, c) => sum + c.totalCost, 0)
  const plannedTotal = costs.reduce((sum, c) => sum + c.plannedTotal, 0)
  const variance = actualTotal - plannedTotal

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Quality control"
        blurb={`Verify what came off the machine, decide what happens to the units that failed, and cost the order on what it actually consumed. Yield target is ${YIELD_TARGET_PCT}%.`}
      />

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-5 md:divide-y-0">
          <Metric
            label="Awaiting verdict"
            value={fmtInt(pending.length)}
            dot="bg-st-hold"
            hint={`${fmtInt(closed.length)} closed`}
          />
          <Metric
            label="Good units"
            value={fmtInt(totals.done)}
            tone="text-st-done"
            dot="bg-st-done"
          />
          <Metric
            label="Rosak"
            value={fmtInt(totals.rosak)}
            tone={totals.rosak ? 'text-st-stopped' : undefined}
            dot="bg-st-stopped"
            hint={`${fmtInt(totals.waste)} waste written off`}
          />
          <Metric
            label="Yield"
            value={`${overallYield}%`}
            tone={belowTarget(overallYield) ? 'text-st-running' : 'text-st-done'}
            hint={`target ${YIELD_TARGET_PCT}%`}
          />
          <Metric
            label="Cost variance"
            value={`${variance >= 0 ? '+' : ''}${fmtMoney(variance)}`}
            tone={variance > 0 ? 'text-st-stopped' : 'text-st-done'}
            hint={`actual ${fmtMoney(actualTotal)} vs planned ${fmtMoney(plannedTotal)}`}
          />
        </div>
      </Panel>

      <Tabs
        active={view}
        onChange={setView}
        tabs={[
          { key: 'pending', label: 'Awaiting verdict', count: pending.length },
          { key: 'closed', label: 'Inspected', count: closed.length },
        ]}
      />

      {shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<SealCheckIcon size={30} weight="light" />}
            title={view === 'pending' ? 'Nothing to inspect' : 'No verdicts recorded yet'}
            body={
              view === 'pending'
                ? 'Work orders appear here once an operator records production against them on the floor terminal.'
                : 'Accepted, reworked and scrapped orders are archived here with the cost they finished at.'
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((wo) => (
            <QcCard key={wo.id} wo={wo} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- QC record --- */

function QcCard({ wo }: { wo: WorkOrder }) {
  const mes = useMes()
  const navigate = useNavigate()
  const sheet = mes.jobSheet(wo.jobSheetId)
  const runs = mes.staffRunsFor(wo.id)
  const t = rollupRuns(runs)
  const pct = yieldOf(t)
  const cost = actualCost(wo, runs)
  const [note, setNote] = useState('')

  const decide = (decision: QcDecision) => {
    mes.recordQc(wo.id, decision, note.trim())
    setNote('')
  }

  const produced = t.done + t.rosak

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-3 py-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate(`/wip/${wo.id}`)}
              className="num text-[14px] font-medium hover:text-accent"
            >
              {wo.code}
            </button>
            {wo.qc ? (
              <Badge tone={DECISION[wo.qc.decision].tone}>{DECISION[wo.qc.decision].label}</Badge>
            ) : belowTarget(pct) ? (
              <Badge tier="active" tone="text-st-running border-st-running/40 bg-st-running/10">
                Below target
              </Badge>
            ) : (
              <Badge tone="text-st-hold border-st-hold/45">Awaiting verdict</Badge>
            )}
          </div>
          <div className="num mt-1 text-[12px] text-text-faint">
            {sheet?.code} · {sheet?.customer} · {wo.slot?.machine ?? 'no machine'}
          </div>
        </div>

        <div className="text-right">
          <div
            className={cx(
              'num text-[22px] leading-none font-medium',
              belowTarget(pct) ? 'text-st-running' : 'text-st-done',
            )}
          >
            {pct}%
          </div>
          <div className="mt-1 text-[12px] text-text-faint">yield on {fmtInt(produced)} produced</div>
        </div>
      </div>

      {/* ------------------------------------------------------- verification --- */}
      <div className="grid gap-0 border-b border-line md:grid-cols-2 md:divide-x md:divide-line">
        <div className="px-3 py-3">
          <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">
            Verification
          </h3>
          <dl className="mt-2 flex flex-col gap-1.5 text-[13px]">
            <Line label="Ordered" value={`${fmtInt(wo.qty)} ${wo.unit}`} />
            <Line label="Produced" value={`${fmtInt(produced)} ${wo.unit}`} />
            <Line label="Good" value={fmtInt(t.done)} tone="text-st-done" />
            <Line label="Rosak" value={fmtInt(t.rosak)} tone={t.rosak ? 'text-st-stopped' : undefined} />
            <Line label="Waste" value={`${fmtInt(t.waste)} ${wo.unit} of material`} />
            <Line label="Downtime" value={`${fmtInt(t.downtimeMin)} min`} />
            <Line
              label="Shortfall against order"
              value={`${fmtInt(Math.max(0, wo.qty - t.done))} ${wo.unit}`}
              tone={wo.qty - t.done > 0 ? 'text-st-running' : undefined}
            />
          </dl>
        </div>

        {/* ------------------------------------------------------ actual cost --- */}
        <div className="px-3 py-3">
          <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">
            Actual cost
          </h3>
          <dl className="mt-2 flex flex-col gap-1.5 text-[13px]">
            <Line
              label={`Material on ${fmtInt(cost.materialUnits)} units`}
              value={fmtMoney(cost.materialCost)}
            />
            <Line label="Labour, hours clocked" value={fmtMoney(cost.labourCost)} />
            <Line label="Overhead" value={fmtMoney(cost.overheadCost)} />
            <Line label="Total actual" value={fmtMoney(cost.totalCost)} strong />
            <Line label="Planned at confirmation" value={fmtMoney(cost.plannedTotal)} />
            <Line
              label="Variance"
              value={`${cost.variance >= 0 ? '+' : ''}${fmtMoney(cost.variance)} (${cost.variancePct}%)`}
              tone={cost.variance > 0 ? 'text-st-stopped' : 'text-st-done'}
              strong
            />
            <Line label="Cost per good unit" value={fmtMoney(cost.unitCost)} />
          </dl>
        </div>
      </div>

      {/* ------------------------------------------------------------ runs --- */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-line bg-panel-2/60">
            <tr>
              <th className={head}>Operator</th>
              <th className={head}>Operation</th>
              <th className={cx(head, 'text-right')}>Good</th>
              <th className={cx(head, 'text-right')}>Rosak</th>
              <th className={cx(head, 'text-right')}>Waste</th>
              <th className={head}>Reason recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-panel-2">
                <td className={cell}>
                  {r.operatorName}
                  <span className="num ml-1.5 text-[12px] text-text-faint">shift {r.shift}</span>
                </td>
                <td className={cx(cell, 'text-text-dim')}>{r.operation}</td>
                <td className={cx(cell, 'num text-right text-st-done')}>{fmtInt(r.qtyDone)}</td>
                <td
                  className={cx(cell, 'num text-right', r.qtyRosak ? 'text-st-stopped' : 'text-text-dim')}
                >
                  {fmtInt(r.qtyRosak)}
                </td>
                <td className={cx(cell, 'num text-right text-text-dim')}>{fmtInt(r.qtyWaste)}</td>
                <td className={cx(cell, 'text-[12px] text-text-faint')}>
                  {r.downtimeReason ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --------------------------------------------------------- verdict --- */}
      {wo.qc ? (
        <div className="border-t border-line bg-panel-2/40 px-3 py-2.5 text-[12px] text-text-dim">
          <span className="text-text">{DECISION[wo.qc.decision].label}</span> by {wo.qc.inspectedBy} on{' '}
          <span className="num">{fmtDateTime(wo.qc.inspectedAt)}</span>, covering{' '}
          <span className="num">{fmtInt(wo.qc.qty)}</span> {wo.unit}.
          {wo.qc.reworkJobSheetCode && (
            <>
              {' '}
              Rework raised as <span className="num text-accent">{wo.qc.reworkJobSheetCode}</span>.
            </>
          )}
          {wo.qc.note && <div className="mt-1 text-text-faint">“{wo.qc.note}”</div>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Inspection note, optional"
            className={cx(inputClass, 'min-w-[200px] flex-1')}
            aria-label={`Inspection note for ${wo.code}`}
          />
          <Button
            variant="primary"
            onClick={() => decide('accepted')}
            icon={<CheckCircleIcon size={15} weight="bold" />}
          >
            Accept {fmtInt(t.done)}
          </Button>
          <Button
            onClick={() => decide('rework')}
            disabled={t.rosak === 0}
            icon={<ArrowUUpLeftIcon size={15} weight="bold" />}
          >
            Rework {fmtInt(t.rosak)}
          </Button>
          <Button
            variant="danger"
            onClick={() => decide('scrapped')}
            disabled={t.rosak === 0}
            icon={<TrashIcon size={15} weight="bold" />}
          >
            Scrap {fmtInt(t.rosak)}
          </Button>
        </div>
      )}

      {!wo.qc && belowTarget(pct) && (
        <div className="flex items-start gap-2 border-t border-line bg-st-running/5 px-3 py-2 text-[12px] text-st-running">
          <WarningOctagonIcon size={13} weight="fill" className="mt-0.5 shrink-0" />
          Yield is {pct}%, under the {YIELD_TARGET_PCT}% target. Rework raises a child job sheet for
          the {fmtInt(t.rosak)} defective units; scrapping writes them off and leaves the cost on this
          order.
        </div>
      )}
    </Panel>
  )
}

function Line({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-text-faint">{label}</dt>
      <dd className={cx('num', strong && 'font-medium', tone ?? 'text-text')}>{value}</dd>
    </div>
  )
}
