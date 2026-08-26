/**
 * Derivations shared by the dashboard, job sheet, quality and master data screens.
 *
 * Nothing here holds state. Every number on those pages is computed from the
 * three arrays in the store, so a screen can never disagree with another one.
 */
import { MATERIAL_MASTER } from '@/data/seed'
import { LABOUR_RATE_PER_HOUR, OVERHEAD_RATE, YIELD_TARGET_PCT } from '@/lib/rates'
import { daysUntil } from '@/lib/format'
import type { JobSheet, StaffRun, WorkOrder } from '@/types'

/* --------------------------------------------------------------- rollups --- */

export interface RunRollup {
  done: number
  rosak: number
  waste: number
  downtimeMin: number
  /** Wall-clock minutes operators were clocked on, open runs counted to now. */
  workedMin: number
}

export function rollupRuns(runs: StaffRun[]): RunRollup {
  return runs.reduce<RunRollup>(
    (acc, r) => {
      const end = r.endedAt ? new Date(r.endedAt).getTime() : Date.now()
      const worked = Math.max(0, (end - new Date(r.startedAt).getTime()) / 60000)
      return {
        done: acc.done + r.qtyDone,
        rosak: acc.rosak + r.qtyRosak,
        waste: acc.waste + r.qtyWaste,
        downtimeMin: acc.downtimeMin + r.downtimeMin,
        workedMin: acc.workedMin + worked,
      }
    },
    { done: 0, rosak: 0, waste: 0, downtimeMin: 0, workedMin: 0 },
  )
}

/** Good over produced, as a percentage with one decimal. 0 when nothing ran. */
export function yieldOf(t: Pick<RunRollup, 'done' | 'rosak'>) {
  const produced = t.done + t.rosak
  return produced ? Math.round((t.done / produced) * 1000) / 10 : 0
}

export const belowTarget = (pct: number) => pct > 0 && pct < YIELD_TARGET_PCT

/* ----------------------------------------------------------- actual cost --- */

export interface ActualCost {
  /** Units that consumed material: good, defective and wasted alike. */
  materialUnits: number
  materialCost: number
  labourCost: number
  overheadCost: number
  totalCost: number
  /** Cost carried by the good units only. This is what the part really cost. */
  unitCost: number
  plannedTotal: number
  variance: number
  variancePct: number
}

/**
 * Actual cost of a work order, as opposed to the planned summary written at
 * confirmation. Material is charged on everything the floor consumed, labour on
 * hours actually clocked, and the whole lot is carried by the good units only:
 * scrap does not become cheaper by being scrap.
 */
export function actualCost(wo: WorkOrder, runs: StaffRun[]): ActualCost {
  const t = rollupRuns(runs)
  const perUnitMaterial = wo.bom.reduce((sum, l) => sum + l.requiredPerUnit * l.unitCost, 0)
  const materialUnits = t.done + t.rosak + t.waste
  const materialCost = perUnitMaterial * materialUnits
  const labourCost = (t.workedMin / 60) * LABOUR_RATE_PER_HOUR
  const overheadCost = labourCost * OVERHEAD_RATE
  const totalCost = materialCost + labourCost + overheadCost
  const plannedTotal = wo.summary?.totalCost ?? 0
  const variance = totalCost - plannedTotal

  return {
    materialUnits,
    materialCost: round2(materialCost),
    labourCost: round2(labourCost),
    overheadCost: round2(overheadCost),
    totalCost: round2(totalCost),
    unitCost: t.done ? round2(totalCost / t.done) : 0,
    plannedTotal,
    variance: round2(variance),
    variancePct: plannedTotal ? Math.round((variance / plannedTotal) * 1000) / 10 : 0,
  }
}

const round2 = (n: number) => Number(n.toFixed(2))

/* ------------------------------------------------------ material demand --- */

export interface MaterialDemand {
  code: string
  name: string
  unit: string
  onHandQty: number
  /** Required across every work order still to be built. */
  requiredQty: number
  /** Positive when stock cannot cover the plan. */
  shortfallQty: number
  /** Work order codes drawing on this material. */
  orders: string[]
}

/**
 * Net requirements across the open plan. A per-order feasibility check passes
 * when that order alone fits; this catches two orders that each fit but together
 * do not.
 */
export function materialDemand(workOrders: WorkOrder[]): MaterialDemand[] {
  const open = workOrders.filter((w) => w.status !== 'completed')
  const byCode = new Map<string, MaterialDemand>()

  for (const wo of open) {
    for (const line of wo.bom) {
      const row =
        byCode.get(line.materialCode) ??
        ({
          code: line.materialCode,
          name: line.name,
          unit: line.unit,
          onHandQty: line.onHandQty,
          requiredQty: 0,
          shortfallQty: 0,
          orders: [],
        } satisfies MaterialDemand)
      row.requiredQty = round2(row.requiredQty + line.requiredQty)
      if (!row.orders.includes(wo.code)) row.orders.push(wo.code)
      byCode.set(line.materialCode, row)
    }
  }

  for (const row of byCode.values()) {
    row.shortfallQty = round2(Math.max(0, row.requiredQty - row.onHandQty))
  }

  return [...byCode.values()].sort((a, b) => b.shortfallQty - a.shortfallQty || a.code.localeCompare(b.code))
}

/** Every material in the master, including ones nothing currently needs. */
export function stockCoverage(workOrders: WorkOrder[]) {
  const demand = new Map(materialDemand(workOrders).map((d) => [d.code, d]))
  return MATERIAL_MASTER.map((m) => {
    const d = demand.get(m.code)
    return {
      ...m,
      requiredQty: d?.requiredQty ?? 0,
      shortfallQty: d?.shortfallQty ?? 0,
      coverPct: d?.requiredQty ? Math.min(999, Math.round((m.onHandQty / d.requiredQty) * 100)) : null,
    }
  })
}

/* ---------------------------------------------------------- machine load --- */

export interface MachineLoad {
  machine: string
  /** Booked slots, earliest first. */
  slots: Array<{ workOrderCode: string; startsAt: string; endsAt: string; status: WorkOrder['status']; autoScheduled: boolean }>
  hours: number
}

export function machineLoad(workOrders: WorkOrder[], machines: readonly string[]): MachineLoad[] {
  return machines.map((machine) => {
    const slots = workOrders
      .filter((w) => w.slot?.machine === machine && w.status !== 'completed')
      .map((w) => ({
        workOrderCode: w.code,
        startsAt: w.slot!.startsAt,
        endsAt: w.slot!.endsAt,
        status: w.status,
        autoScheduled: w.slot!.autoScheduled,
      }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

    const hours = slots.reduce(
      (sum, s) => sum + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 3600000,
      0,
    )
    return { machine, slots, hours: Math.round(hours * 10) / 10 }
  })
}

/* ---------------------------------------------------------------- alerts --- */

export type AlertLevel = 'critical' | 'warning' | 'info'

export interface Alert {
  id: string
  level: AlertLevel
  /** What broke, in the words a supervisor would use. */
  title: string
  detail: string
  /** Route the alert links to, so every notification is actionable. */
  to: string
  at: string
}

const LEVEL_RANK: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 }

/**
 * The notification feed. Derived, never stored: an alert disappears the moment
 * the condition behind it clears, which is the only way a feed stays trustworthy.
 */
export function buildAlerts(
  jobSheets: JobSheet[],
  workOrders: WorkOrder[],
  staffRuns: StaffRun[],
): Alert[] {
  const out: Alert[] = []
  const sheetOf = (id: string) => jobSheets.find((s) => s.id === id)
  const now = new Date().toISOString()

  // 1. A line that has stopped is the loudest thing in the plant.
  for (const wo of workOrders.filter((w) => w.status === 'stopped')) {
    out.push({
      id: `stopped-${wo.id}`,
      level: 'critical',
      title: `${wo.code} stopped on the floor`,
      detail: wo.notes || `${wo.slot?.machine ?? 'Machine'} is idle while this order is halted.`,
      to: `/wip/${wo.id}`,
      at: now,
    })
  }

  // 2. An operator waiting on a supervisor is a person blocked, not a metric.
  for (const run of staffRuns.filter((r) => r.supervisorCalled && r.status !== 'done')) {
    out.push({
      id: `super-${run.id}`,
      level: 'critical',
      title: `${run.operatorName} called for a supervisor`,
      detail: run.downtimeReason ?? `${run.operation} on ${run.machine}, shift ${run.shift}.`,
      to: `/wip/${run.workOrderId}`,
      at: run.startedAt,
    })
  }

  // 3. Material shortages, netted across the whole plan.
  for (const row of materialDemand(workOrders).filter((d) => d.shortfallQty > 0)) {
    out.push({
      id: `short-${row.code}`,
      level: 'warning',
      title: `${row.code} short by ${row.shortfallQty} ${row.unit}`,
      detail: `${row.requiredQty} ${row.unit} required across ${row.orders.join(', ')}, ${row.onHandQty} ${row.unit} on hand.`,
      to: '/job-sheets',
      at: now,
    })
  }

  // 4. Delivery risk on the sheets themselves.
  for (const sheet of jobSheets.filter((s) => s.status !== 'completed')) {
    const days = daysUntil(sheet.dueDate)
    if (days < 0) {
      out.push({
        id: `overdue-${sheet.id}`,
        level: 'critical',
        title: `${sheet.code} is ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`,
        detail: `${sheet.customer} — due ${sheet.dueDate}, still ${sheet.status.replace('_', ' ')}.`,
        to: `/job-sheets/${sheet.id}`,
        at: sheet.lastModifiedAt,
      })
    } else if (days <= 3) {
      out.push({
        id: `due-${sheet.id}`,
        level: 'warning',
        title: `${sheet.code} due in ${days} day${days === 1 ? '' : 's'}`,
        detail: `${sheet.customer} — ${sheet.goals.map((g) => g.productName).join(', ')}.`,
        to: `/job-sheets/${sheet.id}`,
        at: sheet.lastModifiedAt,
      })
    }
  }

  // 5. Quality escapes: finished work whose yield missed target.
  for (const wo of workOrders) {
    const runs = staffRuns.filter((r) => r.workOrderId === wo.id)
    if (runs.length === 0 || wo.qc) continue
    const t = rollupRuns(runs)
    const pct = yieldOf(t)
    if (belowTarget(pct)) {
      out.push({
        id: `yield-${wo.id}`,
        level: 'warning',
        title: `${wo.code} yield at ${pct}%`,
        detail: `${t.rosak} rosak and ${t.waste} waste recorded. Target is ${YIELD_TARGET_PCT}%. Awaiting a QC verdict.`,
        to: '/quality',
        at: now,
      })
    }
  }

  // 6. Sheets sitting on the production manager's desk.
  for (const sheet of jobSheets.filter((s) => s.status === 'pending_approval')) {
    out.push({
      id: `approve-${sheet.id}`,
      level: 'info',
      title: `${sheet.code} waiting on approval`,
      detail: `Confirmed by ${sheet.createdBy}. Stock stays unreserved until it is approved.`,
      to: '/confirmed',
      at: sheet.lastModifiedAt,
    })
  }

  // 7. Drafts the planner has not finished building.
  for (const wo of workOrders.filter((w) => w.status === 'draft')) {
    const missing = [
      wo.bom.length === 0 && 'BOM',
      wo.route.length === 0 && 'route',
      !wo.slot && 'machine slot',
    ].filter(Boolean) as string[]
    if (missing.length === 0) continue
    const sheet = sheetOf(wo.jobSheetId)
    out.push({
      id: `incomplete-${wo.id}`,
      level: 'info',
      title: `${wo.code} needs a ${missing.join(', ')}`,
      detail: `${sheet?.code ?? 'Sheet'} cannot be confirmed until this order is complete.`,
      to: `/job-sheets/${wo.jobSheetId}?wo=${wo.id}`,
      at: wo.createdAt,
    })
  }

  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.at.localeCompare(a.at))
}

/* ------------------------------------------------------------ plant KPIs --- */

export function plantKpis(jobSheets: JobSheet[], workOrders: WorkOrder[], staffRuns: StaffRun[]) {
  const onFloor = workOrders.filter((w) =>
    ['released', 'running', 'stopped', 'completed'].includes(w.status),
  )
  const t = rollupRuns(staffRuns)
  const scheduledMin = t.workedMin
  const runningMin = Math.max(0, scheduledMin - t.downtimeMin)

  return {
    openSheets: jobSheets.filter((s) => s.status !== 'completed').length,
    ordersOnFloor: onFloor.length,
    running: workOrders.filter((w) => w.status === 'running').length,
    stopped: workOrders.filter((w) => w.status === 'stopped').length,
    operatorsActive: staffRuns.filter((r) => r.status === 'running').length,
    ...t,
    yieldPct: yieldOf(t),
    /** Availability: clocked time actually spent producing. */
    availabilityPct: scheduledMin ? Math.round((runningMin / scheduledMin) * 1000) / 10 : 0,
    lateSheets: jobSheets.filter((s) => s.status !== 'completed' && daysUntil(s.dueDate) < 0).length,
    plannedCost: workOrders.reduce((sum, w) => sum + (w.summary?.totalCost ?? 0), 0),
    actualCost: onFloor.reduce(
      (sum, w) => sum + actualCost(w, staffRuns.filter((r) => r.workOrderId === w.id)).totalCost,
      0,
    ),
  }
}
