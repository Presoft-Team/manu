import { useState } from 'react'
import {
  CalendarCheckIcon,
  CalculatorIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  HandPointingIcon,
  LightbulbFilamentIcon,
  LockSimpleIcon,
  PlusIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  TrashIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react'
import { MACHINES, MATERIAL_MASTER, WORK_CENTRES } from '@/data/seed'
import { useMes } from '@/store/mes'
import { Button, Metric, Panel, WorkOrderBadge, cx, inputClass } from '@/components/ui'
import { fmtDateTime, fmtMoney, fmtQty } from '@/lib/format'
import type { JobSheet, WorkOrder } from '@/types'

const cell = 'px-2.5 py-1.5 text-[13px]'
const head = 'px-2.5 py-1.5 text-left text-[11px] font-medium text-text-faint'

export function WorkOrderEditor({ wo, sheet }: { wo: WorkOrder; sheet: JobSheet }) {
  const mes = useMes()
  const locked = mes.workOrderLocked(wo.id)
  const sheetLocked = mes.jobSheetLocked(sheet.id)
  const goal = sheet.goals.find((g) => g.id === wo.goalId)
  const [materialToAdd, setMaterialToAdd] = useState<string>(MATERIAL_MASTER[0].code)

  const bomCost = wo.bom.reduce((sum, l) => sum + l.requiredQty * l.unitCost, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------------------- header --- */}
      <Panel>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="num text-[14px] font-semibold">{wo.code}</span>
            <WorkOrderBadge status={wo.status} />
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none',
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
          </div>

          <div className="text-[12px] text-text-dim">
            {goal?.productCode} <span className="text-text-faint">/</span> {goal?.productName}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-text-dim">
              Order qty
              <input
                type="number"
                min={1}
                value={wo.qty}
                disabled={locked}
                onChange={(e) =>
                  mes.patchWorkOrder(wo.id, { qty: Math.max(1, Number(e.target.value) || 1) })
                }
                className={cx(inputClass, 'num w-24 py-1 text-right')}
              />
              <span className="text-text-faint">{wo.unit}</span>
            </label>
          </div>
        </div>

        {locked && (
          <p className="flex items-center gap-2 border-b border-line bg-panel-2 px-3 py-2 text-[12px] text-text-dim">
            <LockSimpleIcon size={14} weight="fill" className="shrink-0 text-st-confirmed" />
            {sheetLocked
              ? `Job sheet ${sheet.code} is confirmed. Nothing inside it can be modified.`
              : `Confirmed ${wo.confirmedAt ? fmtDateTime(wo.confirmedAt) : ''}. This work order is read only.`}
          </p>
        )}

        {/* Action bar mirrors the confirm gate in the flowchart, in order. */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <Button
            onClick={() => mes.checkFeasibility(wo.id)}
            disabled={locked || wo.bom.length === 0}
            icon={<ShieldCheckIcon size={15} weight="bold" />}
          >
            Check stock feasibility
          </Button>
          <Button
            onClick={() => mes.buildSummary(wo.id)}
            disabled={locked || wo.route.length === 0}
            icon={<CalculatorIcon size={15} weight="bold" />}
          >
            Calculate summary
          </Button>
          <Button
            onClick={() => mes.autoSchedule(wo.id)}
            disabled={locked || wo.route.length === 0}
            icon={<CalendarCheckIcon size={15} weight="bold" />}
          >
            Auto-schedule slot
          </Button>
          <Button
            variant="primary"
            className="ml-auto"
            onClick={() => mes.confirmWorkOrder(wo.id)}
            disabled={locked}
            icon={<CheckCircleIcon size={15} weight="bold" />}
          >
            Confirm work order
          </Button>
        </div>
      </Panel>

      {/* ------------------------------------------------------------- BOM --- */}
      <Panel
        title="Bill of materials"
        action={
          !locked && (
            <div className="flex items-center gap-1.5">
              <select
                value={materialToAdd}
                onChange={(e) => setMaterialToAdd(e.target.value)}
                className={cx(inputClass, 'w-[280px] py-1')}
                aria-label="Material to add"
              >
                {MATERIAL_MASTER.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} · {m.name}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => mes.addBomLine(wo.id, materialToAdd)}
                icon={<PlusIcon size={14} weight="bold" />}
              >
                Add
              </Button>
            </div>
          )
        }
      >
        {wo.bom.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-text-dim">
            No material lines yet. Add one from the material master to start costing this order.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={head}>Material</th>
                  <th className={cx(head, 'w-[104px] text-right')}>Per unit</th>
                  <th className={cx(head, 'w-[112px] text-right')}>Required</th>
                  <th className={cx(head, 'w-[112px] text-right')}>On hand</th>
                  <th className={cx(head, 'w-[104px] text-right')}>Unit cost</th>
                  <th className={cx(head, 'w-[120px] text-right')}>Line cost</th>
                  {!locked && <th className={cx(head, 'w-[44px]')} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {wo.bom.map((line) => {
                  const short = line.requiredQty > line.onHandQty
                  return (
                    <tr key={line.id} className="hover:bg-panel-2">
                      <td className={cell}>
                        <div className="flex items-center gap-1.5">
                          <span className="num text-[12px] text-text-dim">{line.materialCode}</span>
                          {line.aiAssigned && (
                            <LightbulbFilamentIcon
                              size={12}
                              weight="fill"
                              className="text-accent"
                              aria-label="AI assigned line"
                            />
                          )}
                        </div>
                        <div className="text-[12px]">{line.name}</div>
                      </td>
                      <td className={cx(cell, 'text-right')}>
                        <input
                          type="number"
                          step="0.001"
                          min={0}
                          value={line.requiredPerUnit}
                          disabled={locked}
                          onChange={(e) =>
                            mes.patchBomLine(wo.id, line.id, {
                              requiredPerUnit: Number(e.target.value) || 0,
                            })
                          }
                          className={cx(inputClass, 'num w-full py-1 text-right')}
                        />
                      </td>
                      <td className={cx(cell, 'num text-right', short && 'text-st-stopped')}>
                        {fmtQty(line.requiredQty)} {line.unit}
                      </td>
                      <td className={cx(cell, 'num text-right text-text-dim')}>
                        {fmtQty(line.onHandQty)} {line.unit}
                      </td>
                      <td className={cx(cell, 'num text-right text-text-dim')}>
                        {fmtMoney(line.unitCost)}
                      </td>
                      <td className={cx(cell, 'num text-right')}>
                        {fmtMoney(line.requiredQty * line.unitCost)}
                      </td>
                      {!locked && (
                        <td className={cx(cell, 'text-right')}>
                          <button
                            onClick={() => mes.removeBomLine(wo.id, line.id)}
                            className="text-text-faint hover:text-st-stopped"
                            aria-label={`Remove ${line.materialCode}`}
                          >
                            <TrashIcon size={14} weight="bold" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-line-strong">
                <tr>
                  <td className={cx(cell, 'text-[12px] text-text-dim')} colSpan={5}>
                    Material cost
                  </td>
                  <td className={cx(cell, 'num text-right font-medium')}>{fmtMoney(bomCost)}</td>
                  {!locked && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {/* ----------------------------------------------------------- Route --- */}
      <Panel
        title="Route"
        action={
          !locked && (
            <Button onClick={() => mes.addRouteStep(wo.id)} icon={<PlusIcon size={14} weight="bold" />}>
              Add step
            </Button>
          )
        }
      >
        {wo.route.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-text-dim">
            No route steps yet. Add the operations this order has to pass through.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={cx(head, 'w-[44px]')}>Seq</th>
                  <th className={head}>Operation</th>
                  <th className={cx(head, 'w-[150px]')}>Work centre</th>
                  <th className={cx(head, 'w-[230px]')}>Machine</th>
                  <th className={cx(head, 'w-[96px] text-right')}>Setup min</th>
                  <th className={cx(head, 'w-[104px] text-right')}>Cycle sec</th>
                  {!locked && <th className={cx(head, 'w-[44px]')} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {wo.route.map((step) => (
                  <tr key={step.id} className="hover:bg-panel-2">
                    <td className={cx(cell, 'num text-text-dim')}>{step.seq}</td>
                    <td className={cell}>
                      <div className="flex items-center gap-1.5">
                        <input
                          value={step.operation}
                          disabled={locked}
                          onChange={(e) =>
                            mes.patchRouteStep(wo.id, step.id, { operation: e.target.value })
                          }
                          className={cx(inputClass, 'py-1')}
                        />
                        {step.aiAssigned && (
                          <LightbulbFilamentIcon
                            size={12}
                            weight="fill"
                            className="shrink-0 text-accent"
                            aria-label="AI assigned step"
                          />
                        )}
                      </div>
                    </td>
                    <td className={cell}>
                      <select
                        value={step.workCentre}
                        disabled={locked}
                        onChange={(e) =>
                          mes.patchRouteStep(wo.id, step.id, { workCentre: e.target.value })
                        }
                        className={cx(inputClass, 'py-1')}
                      >
                        {WORK_CENTRES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className={cell}>
                      <select
                        value={step.machine}
                        disabled={locked}
                        onChange={(e) =>
                          mes.patchRouteStep(wo.id, step.id, { machine: e.target.value })
                        }
                        className={cx(inputClass, 'py-1')}
                      >
                        {MACHINES.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </td>
                    <td className={cell}>
                      <input
                        type="number"
                        min={0}
                        value={step.setupMin}
                        disabled={locked}
                        onChange={(e) =>
                          mes.patchRouteStep(wo.id, step.id, { setupMin: Number(e.target.value) || 0 })
                        }
                        className={cx(inputClass, 'num w-full py-1 text-right')}
                      />
                    </td>
                    <td className={cell}>
                      <input
                        type="number"
                        min={0}
                        value={step.cycleSecPerUnit}
                        disabled={locked}
                        onChange={(e) =>
                          mes.patchRouteStep(wo.id, step.id, {
                            cycleSecPerUnit: Number(e.target.value) || 0,
                          })
                        }
                        className={cx(inputClass, 'num w-full py-1 text-right')}
                      />
                    </td>
                    {!locked && (
                      <td className={cx(cell, 'text-right')}>
                        <button
                          onClick={() => mes.removeRouteStep(wo.id, step.id)}
                          className="text-text-faint hover:text-st-stopped"
                          aria-label={`Remove step ${step.seq}`}
                        >
                          <TrashIcon size={14} weight="bold" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ---------------------------------------- feasibility and schedule --- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Stock feasibility">
          {wo.feasibility === 'unchecked' && (
            <p className="px-3 py-5 text-[13px] text-text-dim">
              Not validated yet. Run the check to compare required quantities against stock on hand.
            </p>
          )}

          {wo.feasibility === 'ok' && (
            <p className="flex items-center gap-2 px-3 py-5 text-[13px] text-st-done">
              <ShieldCheckIcon size={16} weight="fill" className="shrink-0" />
              Every material line is covered by stock on hand.
            </p>
          )}

          {wo.feasibility === 'shortage' && (
            <div>
              <p className="flex items-start gap-2 border-b border-line px-3 py-2.5 text-[13px] text-st-stopped">
                <WarningOctagonIcon size={16} weight="fill" className="mt-0.5 shrink-0" />
                Insufficient stock. A purchase request was raised and the project manager alerted.
              </p>
              <table className="w-full">
                <thead className="border-b border-line">
                  <tr>
                    <th className={head}>Purchase request</th>
                    <th className={head}>Material</th>
                    <th className={cx(head, 'text-right')}>Shortfall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {wo.purchaseRequests.map((pr) => (
                    <tr key={pr.id}>
                      <td className={cx(cell, 'num text-text-dim')}>
                        <ReceiptIcon size={13} weight="bold" className="mr-1 inline align-[-2px]" />
                        {pr.id.toUpperCase()}
                      </td>
                      <td className={cx(cell, 'num')}>{pr.materialCode}</td>
                      <td className={cx(cell, 'num text-right text-st-stopped')}>
                        {fmtQty(pr.shortfallQty)} {pr.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Machine slot">
          {wo.slot ? (
            <div className="px-3 py-3">
              <div className="num text-[13px] font-medium">{wo.slot.machine}</div>
              <div className="num mt-1 text-[13px] text-text-dim">
                {fmtDateTime(wo.slot.startsAt)} to {fmtDateTime(wo.slot.endsAt)}
              </div>
              <div className="mt-1.5 text-[11px] text-text-faint">
                {wo.slot.autoScheduled ? 'Auto-scheduled by the planner engine' : 'Assigned by a planner'}
              </div>
            </div>
          ) : (
            <p className="px-3 py-5 text-[13px] text-text-dim">
              No slot booked. Auto-schedule places this order in the earliest free window on the first
              route machine.
            </p>
          )}
        </Panel>
      </div>

      {/* --------------------------------------------------------- summary --- */}
      <Panel title="Production summary">
        {wo.summary ? (
          <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
            <Metric
              label="Expected output"
              value={`${fmtQty(wo.summary.expectedOutput)} ${wo.unit}`}
              hint={`${fmtQty(wo.summary.scrapAllowance)} ${wo.unit} scrap allowance`}
            />
            <Metric label="Run time" value={`${wo.summary.runHours} h`} hint="setup plus cycle" />
            <Metric
              label="Material cost"
              value={fmtMoney(wo.summary.materialCost)}
              hint={`labour ${fmtMoney(wo.summary.labourCost)}`}
            />
            <Metric
              label="Total cost"
              value={fmtMoney(wo.summary.totalCost)}
              hint={`overhead ${fmtMoney(wo.summary.overheadCost)}`}
            />
          </div>
        ) : (
          <p className="px-3 py-5 text-[13px] text-text-dim">
            Not calculated yet. The summary engine derives expected output, run time and cost from the
            BOM and route above.
          </p>
        )}
      </Panel>

      {/* ----------------------------------------------------------- notes --- */}
      <Panel title="Notes">
        <div className="p-3">
          <textarea
            rows={2}
            value={wo.notes}
            disabled={locked}
            placeholder="Planner notes carried to the shop floor terminal"
            onChange={(e) => mes.patchWorkOrder(wo.id, { notes: e.target.value })}
            className={cx(inputClass, 'resize-y')}
          />
          {locked && wo.notes === '' && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-text-faint">
              <ClipboardTextIcon size={13} weight="bold" />
              No notes were recorded before this order was confirmed.
            </p>
          )}
        </div>
      </Panel>
    </div>
  )
}
