import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { MATERIAL_MASTER, SEED } from '@/data/seed'
import type {
  BomLine,
  BuildMode,
  JobSheet,
  RouteStep,
  StaffRun,
  WorkOrder,
} from '@/types'

/* Costing constants. Hardcoded here; these become a rates table in the backend. */
const LABOUR_RATE_PER_HOUR = 118
const OVERHEAD_RATE = 0.6
const SCRAP_ALLOWANCE_PCT = 0.02

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

/** Sequence counter for generated codes. Starts past the seeded numbers. */
let woSequence = 440

/**
 * AI auto-assign (flowchart step 4). Looks up a historical BOM and route for the
 * product family. Returns null when the database audit finds nothing, which is
 * what pushes the user back onto the manual path.
 */
function aiAssign(productCode: string, qty: number): { bom: BomLine[]; route: RouteStep[] } | null {
  const family = productCode.split('-')[1] ?? ''
  const templates: Record<string, { bom: Array<[string, number]>; route: Array<[string, string, string, number, number]> }> = {
    BRKT: {
      bom: [['RM-MS-CR2', 0.42], ['CN-M8x25', 4], ['CS-PWD-RAL7016', 0.018]],
      route: [
        ['Blank and pierce', 'Stamping', 'PRESS-02 / Aida 200T', 45, 6],
        ['Powder coat', 'Finishing', 'PAINT-03 / Powder Line B', 60, 14],
      ],
    },
    PIN: {
      bom: [['RM-SS304-12', 0.21], ['CN-WSH-M8', 2]],
      route: [
        ['Cut to length', 'Machining', 'CNC-07 / Doosan Puma 2600', 40, 22],
        ['Deburr and inspect', 'Inspection', 'ASSY-02 / Bench Cell 2', 15, 18],
      ],
    },
    SHAFT: {
      bom: [['RM-SS304-12', 0.34], ['CP-SEAL-N70', 1]],
      route: [
        ['Turn shaft', 'Machining', 'CNC-04 / Okuma LB3000', 80, 118],
        ['Seal fit and test', 'Assembly', 'ASSY-02 / Bench Cell 2', 25, 42],
      ],
    },
    HOUS: {
      bom: [['RM-AL6061-40', 0.87], ['CN-M8x25', 6]],
      route: [
        ['Mill housing', 'Machining', 'CNC-07 / Doosan Puma 2600', 95, 204],
        ['Final assembly', 'Assembly', 'ASSY-02 / Bench Cell 2', 30, 88],
      ],
    },
    SUBF: {
      bom: [['RM-MS-CR2', 0.66], ['CS-WIRE-G3Si', 0.04]],
      route: [
        ['Blank', 'Stamping', 'PRESS-05 / Komatsu 110T', 30, 9],
        ['MIG weld subframe', 'Welding', 'WELD-01 / Fronius TPS 400i', 55, 168],
      ],
    },
  }

  const template = templates[family]
  if (!template) return null

  const bom: BomLine[] = template.bom.map(([code, per]) => {
    const material = MATERIAL_MASTER.find((m) => m.code === code)!
    return {
      id: uid('b'),
      materialCode: material.code,
      name: material.name,
      requiredPerUnit: per,
      requiredQty: Number((per * qty).toFixed(2)),
      unit: material.unit,
      onHandQty: material.onHandQty,
      unitCost: material.unitCost,
      aiAssigned: true,
    }
  })

  const route: RouteStep[] = template.route.map(([operation, workCentre, machine, setupMin, cycleSecPerUnit], i) => ({
    id: uid('r'),
    seq: i + 1,
    operation,
    workCentre,
    machine,
    setupMin,
    cycleSecPerUnit,
    aiAssigned: true,
  }))

  return { bom, route }
}

/** Production summary engine (flowchart step 3, tail). */
export function calcSummary(wo: WorkOrder) {
  const materialCost = wo.bom.reduce((sum, l) => sum + l.requiredQty * l.unitCost, 0)
  const runHours = wo.route.reduce(
    (sum, s) => sum + s.setupMin / 60 + (wo.qty * s.cycleSecPerUnit) / 3600,
    0,
  )
  const labourCost = runHours * LABOUR_RATE_PER_HOUR
  const overheadCost = labourCost * OVERHEAD_RATE
  const scrapAllowance = Math.ceil(wo.qty * SCRAP_ALLOWANCE_PCT)
  return {
    expectedOutput: wo.qty - scrapAllowance,
    scrapAllowance,
    materialCost: Number(materialCost.toFixed(2)),
    labourCost: Number(labourCost.toFixed(2)),
    overheadCost: Number(overheadCost.toFixed(2)),
    totalCost: Number((materialCost + labourCost + overheadCost).toFixed(2)),
    runHours: Number(runHours.toFixed(1)),
  }
}

export interface MesState {
  jobSheets: JobSheet[]
  workOrders: WorkOrder[]
  staffRuns: StaffRun[]
}

interface MesApi extends MesState {
  flash: string | null
  clearFlash: () => void

  jobSheet: (id: string) => JobSheet | undefined
  workOrdersFor: (jobSheetId: string) => WorkOrder[]
  staffRunsFor: (workOrderId: string) => StaffRun[]
  /** Remaining quantity per goal after existing work orders are subtracted. */
  remainingByGoal: (jobSheetId: string) => Record<string, number>

  jobSheetLocked: (jobSheetId: string) => boolean
  workOrderLocked: (workOrderId: string) => boolean

  addWorkOrder: (jobSheetId: string, mode: BuildMode, goalId: string, qty: number) => string | null
  removeWorkOrder: (workOrderId: string) => void
  patchWorkOrder: (workOrderId: string, patch: Partial<WorkOrder>) => void

  addBomLine: (workOrderId: string, materialCode: string) => void
  patchBomLine: (workOrderId: string, lineId: string, patch: Partial<BomLine>) => void
  removeBomLine: (workOrderId: string, lineId: string) => void

  addRouteStep: (workOrderId: string) => void
  patchRouteStep: (workOrderId: string, stepId: string, patch: Partial<RouteStep>) => void
  removeRouteStep: (workOrderId: string, stepId: string) => void

  checkFeasibility: (workOrderId: string) => void
  buildSummary: (workOrderId: string) => void
  autoSchedule: (workOrderId: string) => void
  confirmWorkOrder: (workOrderId: string) => void

  saveDraft: (jobSheetId: string) => void
  confirmJobSheet: (jobSheetId: string) => void
  approveJobSheet: (jobSheetId: string) => void
  rejectJobSheet: (jobSheetId: string, reason: string) => void

  resetDemo: () => void
}

const MesContext = createContext<MesApi | null>(null)

export function MesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MesState>(() => clone(SEED))
  const [flash, setFlash] = useState<string | null>(null)

  const say = useCallback((message: string) => setFlash(message), [])

  const mutateWo = useCallback(
    (workOrderId: string, fn: (wo: WorkOrder) => void) => {
      setState((prev) => ({
        ...prev,
        workOrders: prev.workOrders.map((wo) => {
          if (wo.id !== workOrderId) return wo
          const next = clone(wo)
          fn(next)
          return next
        }),
      }))
    },
    [],
  )

  const jobSheet = useCallback(
    (id: string) => state.jobSheets.find((s) => s.id === id),
    [state.jobSheets],
  )

  const workOrdersFor = useCallback(
    (jobSheetId: string) => state.workOrders.filter((wo) => wo.jobSheetId === jobSheetId),
    [state.workOrders],
  )

  const staffRunsFor = useCallback(
    (workOrderId: string) => state.staffRuns.filter((r) => r.workOrderId === workOrderId),
    [state.staffRuns],
  )

  const remainingByGoal = useCallback(
    (jobSheetId: string) => {
      const sheet = state.jobSheets.find((s) => s.id === jobSheetId)
      if (!sheet) return {}
      const used: Record<string, number> = {}
      for (const wo of state.workOrders) {
        if (wo.jobSheetId !== jobSheetId) continue
        used[wo.goalId] = (used[wo.goalId] ?? 0) + wo.qty
      }
      return Object.fromEntries(
        sheet.goals.map((g) => [g.id, g.targetQty - (used[g.id] ?? 0)]),
      )
    },
    [state.jobSheets, state.workOrders],
  )

  const jobSheetLocked = useCallback(
    (jobSheetId: string) => {
      const sheet = state.jobSheets.find((s) => s.id === jobSheetId)
      return !!sheet && sheet.status !== 'draft'
    },
    [state.jobSheets],
  )

  const workOrderLocked = useCallback(
    (workOrderId: string) => {
      const wo = state.workOrders.find((w) => w.id === workOrderId)
      if (!wo) return true
      return wo.status !== 'draft' || jobSheetLocked(wo.jobSheetId)
    },
    [state.workOrders, jobSheetLocked],
  )

  const addWorkOrder = useCallback<MesApi['addWorkOrder']>(
    (jobSheetId, mode, goalId, qty) => {
      const sheet = state.jobSheets.find((s) => s.id === jobSheetId)
      const goal = sheet?.goals.find((g) => g.id === goalId)
      if (!sheet || !goal) return null
      if (sheet.status !== 'draft') {
        say('Job sheet is confirmed. Work orders can no longer be added.')
        return null
      }

      const id = uid('wo')
      woSequence += 1
      const assigned = mode === 'ai' ? aiAssign(goal.productCode, qty) : null

      const wo: WorkOrder = {
        id,
        code: `WO-2608-0${woSequence}`,
        jobSheetId,
        goalId,
        qty,
        unit: goal.unit,
        mode,
        status: 'draft',
        bom: assigned?.bom ?? [],
        route: assigned?.route ?? [],
        slot: null,
        summary: null,
        feasibility: 'unchecked',
        purchaseRequests: [],
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        notes: '',
      }

      setState((prev) => ({
        ...prev,
        workOrders: [...prev.workOrders, wo],
        jobSheets: prev.jobSheets.map((s) =>
          s.id === jobSheetId ? { ...s, workOrderIds: [...s.workOrderIds, id] } : s,
        ),
      }))

      if (mode === 'ai') {
        say(
          assigned
            ? `AI assigned BOM and route for ${goal.productCode}.`
            : `No historical BOM or route for ${goal.productCode}. Falling back to manual entry.`,
        )
      }
      return id
    },
    [state.jobSheets, say],
  )

  const removeWorkOrder = useCallback<MesApi['removeWorkOrder']>(
    (workOrderId) => {
      setState((prev) => {
        const wo = prev.workOrders.find((w) => w.id === workOrderId)
        if (!wo || wo.status !== 'draft') return prev
        return {
          ...prev,
          workOrders: prev.workOrders.filter((w) => w.id !== workOrderId),
          jobSheets: prev.jobSheets.map((s) =>
            s.id === wo.jobSheetId
              ? { ...s, workOrderIds: s.workOrderIds.filter((i) => i !== workOrderId) }
              : s,
          ),
        }
      })
    },
    [],
  )

  const patchWorkOrder = useCallback<MesApi['patchWorkOrder']>(
    (workOrderId, patch) => {
      mutateWo(workOrderId, (wo) => {
        Object.assign(wo, patch)
        // Any structural edit invalidates the previous feasibility and costing.
        if ('qty' in patch) {
          wo.bom = wo.bom.map((l) => ({
            ...l,
            requiredQty: Number((l.requiredPerUnit * (patch.qty ?? wo.qty)).toFixed(2)),
          }))
        }
        wo.feasibility = 'unchecked'
        wo.summary = null
      })
    },
    [mutateWo],
  )

  const addBomLine = useCallback<MesApi['addBomLine']>(
    (workOrderId, materialCode) => {
      const material = MATERIAL_MASTER.find((m) => m.code === materialCode)
      if (!material) return
      mutateWo(workOrderId, (wo) => {
        wo.bom.push({
          id: uid('b'),
          materialCode: material.code,
          name: material.name,
          requiredPerUnit: 1,
          requiredQty: wo.qty,
          unit: material.unit,
          onHandQty: material.onHandQty,
          unitCost: material.unitCost,
        })
        wo.feasibility = 'unchecked'
        wo.summary = null
      })
    },
    [mutateWo],
  )

  const patchBomLine = useCallback<MesApi['patchBomLine']>(
    (workOrderId, lineId, patch) => {
      mutateWo(workOrderId, (wo) => {
        wo.bom = wo.bom.map((l) => {
          if (l.id !== lineId) return l
          const next = { ...l, ...patch }
          next.requiredQty = Number((next.requiredPerUnit * wo.qty).toFixed(2))
          return next
        })
        wo.feasibility = 'unchecked'
        wo.summary = null
      })
    },
    [mutateWo],
  )

  const removeBomLine = useCallback<MesApi['removeBomLine']>(
    (workOrderId, lineId) => {
      mutateWo(workOrderId, (wo) => {
        wo.bom = wo.bom.filter((l) => l.id !== lineId)
        wo.feasibility = 'unchecked'
        wo.summary = null
      })
    },
    [mutateWo],
  )

  const addRouteStep = useCallback<MesApi['addRouteStep']>(
    (workOrderId) => {
      mutateWo(workOrderId, (wo) => {
        wo.route.push({
          id: uid('r'),
          seq: wo.route.length + 1,
          operation: 'New operation',
          workCentre: 'Machining',
          machine: 'CNC-04 / Okuma LB3000',
          setupMin: 30,
          cycleSecPerUnit: 60,
        })
        wo.summary = null
      })
    },
    [mutateWo],
  )

  const patchRouteStep = useCallback<MesApi['patchRouteStep']>(
    (workOrderId, stepId, patch) => {
      mutateWo(workOrderId, (wo) => {
        wo.route = wo.route.map((s) => (s.id === stepId ? { ...s, ...patch } : s))
        wo.summary = null
      })
    },
    [mutateWo],
  )

  const removeRouteStep = useCallback<MesApi['removeRouteStep']>(
    (workOrderId, stepId) => {
      mutateWo(workOrderId, (wo) => {
        wo.route = wo.route.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, seq: i + 1 }))
        wo.summary = null
      })
    },
    [mutateWo],
  )

  /** Feasibility validation. Raises a PR and alerts the manager on shortage. */
  const checkFeasibility = useCallback<MesApi['checkFeasibility']>(
    (workOrderId) => {
      let shortages = 0
      mutateWo(workOrderId, (wo) => {
        const short = wo.bom.filter((l) => l.requiredQty > l.onHandQty)
        shortages = short.length
        wo.feasibility = short.length ? 'shortage' : 'ok'
        wo.purchaseRequests = short.map((l) => ({
          id: uid('pr'),
          materialCode: l.materialCode,
          shortfallQty: Number((l.requiredQty - l.onHandQty).toFixed(2)),
          unit: l.unit,
          raisedAt: new Date().toISOString(),
          managerAlerted: true,
        }))
      })
      say(
        shortages
          ? `Stock short on ${shortages} material line${shortages > 1 ? 's' : ''}. Purchase request raised, project manager alerted.`
          : 'Stock feasibility passed. All material lines covered.',
      )
    },
    [mutateWo, say],
  )

  const buildSummary = useCallback<MesApi['buildSummary']>(
    (workOrderId) => {
      mutateWo(workOrderId, (wo) => {
        wo.summary = calcSummary(wo)
      })
      say('Production summary calculated.')
    },
    [mutateWo, say],
  )

  const autoSchedule = useCallback<MesApi['autoSchedule']>(
    (workOrderId) => {
      mutateWo(workOrderId, (wo) => {
        const machine = wo.route[0]?.machine ?? 'CNC-04 / Okuma LB3000'
        const hours = wo.summary?.runHours ?? calcSummary(wo).runHours
        const start = new Date()
        start.setDate(start.getDate() + 2)
        start.setHours(7, 0, 0, 0)
        const end = new Date(start.getTime() + hours * 3600 * 1000)
        wo.slot = {
          machine,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          autoScheduled: true,
        }
      })
      say('Machine slot auto-scheduled against the earliest free window.')
    },
    [mutateWo, say],
  )

  const confirmWorkOrder = useCallback<MesApi['confirmWorkOrder']>(
    (workOrderId) => {
      const wo = state.workOrders.find((w) => w.id === workOrderId)
      if (!wo) return
      if (wo.bom.length === 0 || wo.route.length === 0) {
        say('Add at least one BOM line and one route step before confirming.')
        return
      }
      if (wo.feasibility !== 'ok') {
        say('Run feasibility validation and clear all shortages before confirming.')
        return
      }
      if (!wo.summary) {
        say('Calculate the production summary before confirming.')
        return
      }
      if (!wo.slot) {
        say('Assign a machine slot before confirming.')
        return
      }
      mutateWo(workOrderId, (w) => {
        w.status = 'confirmed'
        w.confirmedAt = new Date().toISOString()
      })
      say(`${wo.code} confirmed and locked. It can no longer be modified.`)
    },
    [state.workOrders, mutateWo, say],
  )

  const saveDraft = useCallback<MesApi['saveDraft']>(
    (jobSheetId) => {
      const sheet = state.jobSheets.find((s) => s.id === jobSheetId)
      say(`Draft saved${sheet ? ` for ${sheet.code}` : ''} at ${new Date().toLocaleTimeString()}.`)
    },
    [state.jobSheets, say],
  )

  const confirmJobSheet = useCallback<MesApi['confirmJobSheet']>(
    (jobSheetId) => {
      const orders = state.workOrders.filter((w) => w.jobSheetId === jobSheetId)
      if (orders.length === 0) {
        say('Add at least one work order before confirming the job sheet.')
        return
      }
      const unconfirmed = orders.filter((w) => w.status === 'draft')
      if (unconfirmed.length) {
        say(
          `${unconfirmed.length} work order${unconfirmed.length > 1 ? 's are' : ' is'} still in draft: ${unconfirmed
            .map((w) => w.code)
            .join(', ')}.`,
        )
        return
      }
      setState((prev) => ({
        ...prev,
        jobSheets: prev.jobSheets.map((s) =>
          s.id === jobSheetId ? { ...s, status: 'pending_approval', rejectionReason: null } : s,
        ),
      }))
      say('Job sheet confirmed and locked. Sent to the production manager for approval.')
    },
    [state.workOrders, say],
  )

  const approveJobSheet = useCallback<MesApi['approveJobSheet']>(
    (jobSheetId) => {
      setState((prev) => ({
        ...prev,
        jobSheets: prev.jobSheets.map((s) =>
          s.id === jobSheetId ? { ...s, status: 'approved', approvedBy: 'Ridzuan Hashim' } : s,
        ),
        workOrders: prev.workOrders.map((w) =>
          w.jobSheetId === jobSheetId && w.status === 'confirmed' ? { ...w, status: 'released' } : w,
        ),
      }))
      say('Job sheet approved. Stock soft-reserved and work orders released to the floor.')
    },
    [say],
  )

  const rejectJobSheet = useCallback<MesApi['rejectJobSheet']>(
    (jobSheetId, reason) => {
      setState((prev) => ({
        ...prev,
        jobSheets: prev.jobSheets.map((s) =>
          s.id === jobSheetId ? { ...s, status: 'draft', rejectionReason: reason } : s,
        ),
        workOrders: prev.workOrders.map((w) =>
          w.jobSheetId === jobSheetId && w.status === 'confirmed'
            ? { ...w, status: 'draft', confirmedAt: null }
            : w,
        ),
      }))
      say('Job sheet returned to draft. Work orders are editable again.')
    },
    [say],
  )

  const resetDemo = useCallback(() => {
    setState(clone(SEED))
    woSequence = 440
    say('Demo data reset.')
  }, [say])

  const value = useMemo<MesApi>(
    () => ({
      ...state,
      flash,
      clearFlash: () => setFlash(null),
      jobSheet,
      workOrdersFor,
      staffRunsFor,
      remainingByGoal,
      jobSheetLocked,
      workOrderLocked,
      addWorkOrder,
      removeWorkOrder,
      patchWorkOrder,
      addBomLine,
      patchBomLine,
      removeBomLine,
      addRouteStep,
      patchRouteStep,
      removeRouteStep,
      checkFeasibility,
      buildSummary,
      autoSchedule,
      confirmWorkOrder,
      saveDraft,
      confirmJobSheet,
      approveJobSheet,
      rejectJobSheet,
      resetDemo,
    }),
    [
      state, flash, jobSheet, workOrdersFor, staffRunsFor, remainingByGoal, jobSheetLocked,
      workOrderLocked, addWorkOrder, removeWorkOrder, patchWorkOrder, addBomLine, patchBomLine,
      removeBomLine, addRouteStep, patchRouteStep, removeRouteStep, checkFeasibility, buildSummary,
      autoSchedule, confirmWorkOrder, saveDraft, confirmJobSheet, approveJobSheet, rejectJobSheet,
      resetDemo,
    ],
  )

  return <MesContext.Provider value={value}>{children}</MesContext.Provider>
}

export function useMes() {
  const ctx = useContext(MesContext)
  if (!ctx) throw new Error('useMes must be used inside MesProvider')
  return ctx
}
