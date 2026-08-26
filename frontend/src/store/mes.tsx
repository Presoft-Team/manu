import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { BOM_LIBRARY, MATERIAL_MASTER, ROUTE_LIBRARY, SEED } from '@/data/seed'
import type {
  BomLine,
  BuildMode,
  DemandSource,
  JobSheet,
  JobSheetGoal,
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

/** Sequence counters for generated codes. Start past the seeded numbers. */
let woSequence = 440
let jsSequence = 144

/** Product family token: FG-BRKT-220 -> BRKT. */
const familyOf = (productCode: string) => productCode.split('-')[1] ?? ''

/** Expand a BOM_LIBRARY entry into costed lines for this order quantity. */
export function bomFromTemplate(templateId: string, qty: number, aiAssigned = false): BomLine[] {
  const template = BOM_LIBRARY.find((t) => t.id === templateId)
  if (!template) return []
  return template.lines.map(([code, per]) => {
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
      aiAssigned,
    }
  })
}

/** Expand a ROUTE_LIBRARY entry into sequenced steps. */
export function routeFromTemplate(templateId: string, aiAssigned = false): RouteStep[] {
  const template = ROUTE_LIBRARY.find((t) => t.id === templateId)
  if (!template) return []
  return template.steps.map(([operation, workCentre, machine, setupMin, cycleSecPerUnit], i) => ({
    id: uid('r'),
    seq: i + 1,
    operation,
    workCentre,
    machine,
    setupMin,
    cycleSecPerUnit,
    aiAssigned,
  }))
}

/**
 * AI auto-assign (flowchart step 4). Matches a historical BOM and route by product
 * family. Returns null when the audit finds nothing, which is what pushes the user
 * back onto the manual path.
 */
function aiAssign(
  productCode: string,
  qty: number,
): { bomTemplateId: string; routeTemplateId: string; bom: BomLine[]; route: RouteStep[] } | null {
  const family = familyOf(productCode)
  const bomTemplate = BOM_LIBRARY.find((t) => t.family === family)
  const routeTemplate = ROUTE_LIBRARY.find((t) => t.family === family)
  if (!bomTemplate || !routeTemplate) return null
  return {
    bomTemplateId: bomTemplate.id,
    routeTemplateId: routeTemplate.id,
    bom: bomFromTemplate(bomTemplate.id, qty, true),
    route: routeFromTemplate(routeTemplate.id, true),
  }
}

/** Earliest free window on a machine, two days out at shift start. */
function slotFor(machine: string, hours: number) {
  const start = new Date()
  start.setDate(start.getDate() + 2)
  start.setHours(7, 0, 0, 0)
  return {
    machine,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + hours * 3600 * 1000).toISOString(),
    autoScheduled: true,
  }
}

/** Compare required against on-hand and raise a PR per short line. */
function runFeasibility(wo: WorkOrder) {
  const short = wo.bom.filter((l) => l.requiredQty > l.onHandQty)
  wo.feasibility = short.length ? 'shortage' : 'ok'
  wo.purchaseRequests = short.map((l) => ({
    id: uid('pr'),
    materialCode: l.materialCode,
    shortfallQty: Number((l.requiredQty - l.onHandQty).toFixed(2)),
    unit: l.unit,
    raisedAt: new Date().toISOString(),
    managerAlerted: true,
  }))
  return short.length
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

/** What the upload / manual-entry dialog hands back. */
export interface NewJobSheetInput {
  customer: string
  source: DemandSource
  reference: string
  dueDate: string
  createdBy: string
  goals: Array<Omit<JobSheetGoal, 'id'>>
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

  /** Create a draft sheet from an uploaded file or hand entry. Returns its id. */
  createJobSheet: (input: NewJobSheetInput) => string

  addWorkOrder: (jobSheetId: string, mode: BuildMode, goalId: string, qty: number) => string | null
  removeWorkOrder: (workOrderId: string) => void
  patchWorkOrder: (workOrderId: string, patch: Partial<WorkOrder>) => void

  /** Pick a BOM off the library. Replaces every line on the order. */
  applyBomTemplate: (workOrderId: string, templateId: string) => void
  /** Pick a route off the library. Replaces every step and clears the slot. */
  applyRouteTemplate: (workOrderId: string, templateId: string) => void
  /**
   * The job sheet lightbulb: one click fills the whole sheet. Splits every goal
   * remainder into a work order, assigns BOM and route, checks stock, costs it
   * and books a machine slot.
   */
  aiPlanJobSheet: (jobSheetId: string) => void

  addBomLine: (workOrderId: string, materialCode: string) => void
  patchBomLine: (workOrderId: string, lineId: string, patch: Partial<BomLine>) => void
  removeBomLine: (workOrderId: string, lineId: string) => void

  addRouteStep: (workOrderId: string) => void
  patchRouteStep: (workOrderId: string, stepId: string, patch: Partial<RouteStep>) => void
  removeRouteStep: (workOrderId: string, stepId: string) => void

  checkFeasibility: (workOrderId: string) => void
  /** Raise a purchase request for one short material line. */
  raisePurchaseRequest: (workOrderId: string, lineId: string) => void
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

  /** Stamp the sheet's "last modified" column. Any write to a sheet or its work orders. */
  const touch = (sheets: JobSheet[], jobSheetId: string, at = new Date().toISOString()) =>
    sheets.map((s) => (s.id === jobSheetId ? { ...s, lastModifiedAt: at } : s))

  const mutateWo = useCallback(
    (workOrderId: string, fn: (wo: WorkOrder) => void) => {
      setState((prev) => {
        const target = prev.workOrders.find((wo) => wo.id === workOrderId)
        return {
          ...prev,
          workOrders: prev.workOrders.map((wo) => {
            if (wo.id !== workOrderId) return wo
            const next = clone(wo)
            fn(next)
            return next
          }),
          jobSheets: target ? touch(prev.jobSheets, target.jobSheetId) : prev.jobSheets,
        }
      })
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

  const createJobSheet = useCallback<MesApi['createJobSheet']>(
    (input) => {
      const id = uid('js')
      jsSequence += 1
      const now = new Date().toISOString()

      const sheet: JobSheet = {
        id,
        code: `JS-2608-0${jsSequence}`,
        source: input.source,
        reference: input.reference,
        customer: input.customer,
        createdBy: input.createdBy,
        createdAt: now,
        lastModifiedAt: now,
        dueDate: input.dueDate,
        status: 'draft',
        goals: input.goals.map((g) => ({ ...g, id: uid('g') })),
        workOrderIds: [],
        approvedBy: null,
        rejectionReason: null,
      }

      setState((prev) => ({ ...prev, jobSheets: [sheet, ...prev.jobSheets] }))
      say(
        `${sheet.code} created as a draft with ${sheet.goals.length} goal${sheet.goals.length === 1 ? '' : 's'}. Plan it with the lightbulb or add work orders by hand.`,
      )
      return id
    },
    [say],
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
        bomTemplateId: assigned?.bomTemplateId ?? null,
        routeTemplateId: assigned?.routeTemplateId ?? null,
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
          s.id === jobSheetId
            ? { ...s, workOrderIds: [...s.workOrderIds, id], lastModifiedAt: wo.createdAt }
            : s,
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
              ? {
                  ...s,
                  workOrderIds: s.workOrderIds.filter((i) => i !== workOrderId),
                  lastModifiedAt: new Date().toISOString(),
                }
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

  const applyBomTemplate = useCallback<MesApi['applyBomTemplate']>(
    (workOrderId, templateId) => {
      mutateWo(workOrderId, (wo) => {
        wo.bomTemplateId = templateId || null
        wo.bom = templateId ? bomFromTemplate(templateId, wo.qty) : []
        // A different BOM invalidates stock, costing and the booked slot.
        wo.feasibility = 'unchecked'
        wo.purchaseRequests = []
        wo.summary = null
        wo.slot = null
      })
    },
    [mutateWo],
  )

  const applyRouteTemplate = useCallback<MesApi['applyRouteTemplate']>(
    (workOrderId, templateId) => {
      mutateWo(workOrderId, (wo) => {
        wo.routeTemplateId = templateId || null
        wo.route = templateId ? routeFromTemplate(templateId) : []
        wo.summary = null
        wo.slot = null
      })
    },
    [mutateWo],
  )

  const aiPlanJobSheet = useCallback<MesApi['aiPlanJobSheet']>(
    (jobSheetId) => {
      const sheet = state.jobSheets.find((s) => s.id === jobSheetId)
      if (!sheet) return
      if (sheet.status !== 'draft') {
        say('Job sheet is confirmed. The AI planner only runs on drafts.')
        return
      }

      /*
       * Everything is computed here rather than inside the setState updater:
       * StrictMode invokes updaters twice, which would double every tally below.
       */
      let created = 0
      let planned = 0
      let shortages = 0
      const unmatched: string[] = []

      const mine = state.workOrders.filter((w) => w.jobSheetId === jobSheetId)
      const added: WorkOrder[] = []

      // 1. Split every uncovered goal remainder into its own work order.
      for (const goal of sheet.goals) {
        const used = mine.reduce((sum, w) => (w.goalId === goal.id ? sum + w.qty : sum), 0)
        const left = goal.targetQty - used
        if (left <= 0) continue

        const assigned = aiAssign(goal.productCode, left)
        if (!assigned) {
          unmatched.push(goal.productCode)
          continue
        }
        woSequence += 1
        created += 1
        added.push({
          id: uid('wo'),
          code: `WO-2608-0${woSequence}`,
          jobSheetId,
          goalId: goal.id,
          qty: left,
          unit: goal.unit,
          mode: 'ai',
          status: 'draft',
          bomTemplateId: assigned.bomTemplateId,
          routeTemplateId: assigned.routeTemplateId,
          bom: assigned.bom,
          route: assigned.route,
          slot: null,
          summary: null,
          feasibility: 'unchecked',
          purchaseRequests: [],
          createdAt: new Date().toISOString(),
          confirmedAt: null,
          notes: '',
        })
      }

      // 2. Finish every draft order on the sheet: BOM, route, stock, cost, slot.
      const workOrders = [...state.workOrders, ...added].map((wo) => {
        if (wo.jobSheetId !== jobSheetId || wo.status !== 'draft') return wo
        const next = clone(wo)
        const goal = sheet.goals.find((g) => g.id === next.goalId)
        const family = goal ? familyOf(goal.productCode) : ''

        if (!next.bomTemplateId) {
          const t = BOM_LIBRARY.find((b) => b.family === family)
          if (t) {
            next.bomTemplateId = t.id
            next.bom = bomFromTemplate(t.id, next.qty, true)
          }
        }
        if (!next.routeTemplateId) {
          const t = ROUTE_LIBRARY.find((r) => r.family === family)
          if (t) {
            next.routeTemplateId = t.id
            next.route = routeFromTemplate(t.id, true)
          }
        }
        if (next.bom.length === 0 || next.route.length === 0) {
          if (goal && !unmatched.includes(goal.productCode)) unmatched.push(goal.productCode)
          return next
        }

        shortages += runFeasibility(next)
        next.summary = calcSummary(next)
        next.slot = slotFor(next.route[0].machine, next.summary.runHours)
        next.mode = 'ai'
        planned += 1
        return next
      })

      setState((prev) => ({
        ...prev,
        workOrders,
        jobSheets: touch(prev.jobSheets, jobSheetId).map((s) =>
          s.id === jobSheetId
            ? { ...s, workOrderIds: workOrders.filter((w) => w.jobSheetId === jobSheetId).map((w) => w.id) }
            : s,
        ),
      }))

      const parts = [
        created ? `${created} work order${created > 1 ? 's' : ''} created` : null,
        planned ? `${planned} planned with BOM, route and machine slot` : null,
        shortages ? `${shortages} material line${shortages > 1 ? 's' : ''} short, purchase request raised` : null,
        unmatched.length ? `no history for ${[...new Set(unmatched)].join(', ')}, build those by hand` : null,
      ].filter(Boolean)

      say(parts.length ? `AI planner: ${parts.join('. ')}.` : 'AI planner: nothing left to plan on this sheet.')
    },
    [state.jobSheets, state.workOrders, say],
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

  const raisePurchaseRequest = useCallback<MesApi['raisePurchaseRequest']>(
    (workOrderId, lineId) => {
      let material = ''
      mutateWo(workOrderId, (wo) => {
        const line = wo.bom.find((l) => l.id === lineId)
        if (!line || wo.purchaseRequests.some((pr) => pr.materialCode === line.materialCode)) return
        material = line.materialCode
        wo.purchaseRequests.push({
          id: uid('pr'),
          materialCode: line.materialCode,
          shortfallQty: Number((line.requiredQty - line.onHandQty).toFixed(2)),
          unit: line.unit,
          raisedAt: new Date().toISOString(),
          managerAlerted: true,
        })
        wo.feasibility = 'shortage'
      })
      say(
        material
          ? `Purchase request raised for ${material}. Project manager alerted.`
          : 'A purchase request is already open for that material.',
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
      setState((prev) => ({ ...prev, jobSheets: touch(prev.jobSheets, jobSheetId) }))
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

      /*
       * Work orders are never confirmed on their own: confirming the sheet is what
       * confirms them. So the gate lives here. An order is only blocked when it is
       * genuinely unbuildable, not merely unchecked.
       */
      const incomplete = orders.filter(
        (w) => w.status === 'draft' && (w.bom.length === 0 || w.route.length === 0 || !w.slot),
      )
      if (incomplete.length) {
        say(
          `${incomplete.map((w) => w.code).join(', ')} still ${incomplete.length > 1 ? 'need' : 'needs'} a BOM, a route and a machine slot.`,
        )
        return
      }

      // Shortness is recomputed here rather than trusting the stored flag, which
      // goes stale the moment a quantity changes.
      const short = orders.filter(
        (w) => w.status === 'draft' && w.bom.some((l) => l.requiredQty > l.onHandQty),
      )
      if (short.length) {
        say(
          `${short.map((w) => w.code).join(', ')} ${short.length > 1 ? 'are' : 'is'} short on stock. Clear the purchase request or edit the quantity first.`,
        )
        return
      }

      setState((prev) => ({
        ...prev,
        workOrders: prev.workOrders.map((w) =>
          w.jobSheetId === jobSheetId && w.status === 'draft'
            ? { ...w, status: 'confirmed', confirmedAt: new Date().toISOString() }
            : w,
        ),
        jobSheets: prev.jobSheets.map((s) =>
          s.id === jobSheetId
            ? {
                ...s,
                status: 'pending_approval',
                rejectionReason: null,
                lastModifiedAt: new Date().toISOString(),
              }
            : s,
        ),
      }))
      say(
        `Job sheet confirmed and locked. ${orders.length} work order${orders.length > 1 ? 's' : ''} confirmed with it, pending the production manager.`,
      )
    },
    [state.workOrders, say],
  )

  const approveJobSheet = useCallback<MesApi['approveJobSheet']>(
    (jobSheetId) => {
      setState((prev) => ({
        ...prev,
        jobSheets: prev.jobSheets.map((s) =>
          s.id === jobSheetId
            ? {
                ...s,
                status: 'approved',
                approvedBy: 'Ridzuan Hashim',
                lastModifiedAt: new Date().toISOString(),
              }
            : s,
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
          s.id === jobSheetId
            ? {
                ...s,
                status: 'draft',
                rejectionReason: reason,
                lastModifiedAt: new Date().toISOString(),
              }
            : s,
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
    jsSequence = 144
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
      createJobSheet,
      addWorkOrder,
      removeWorkOrder,
      patchWorkOrder,
      applyBomTemplate,
      applyRouteTemplate,
      aiPlanJobSheet,
      addBomLine,
      patchBomLine,
      removeBomLine,
      addRouteStep,
      patchRouteStep,
      removeRouteStep,
      checkFeasibility,
      raisePurchaseRequest,
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
      workOrderLocked, createJobSheet, addWorkOrder, removeWorkOrder, patchWorkOrder, applyBomTemplate,
      applyRouteTemplate, aiPlanJobSheet, addBomLine, patchBomLine,
      removeBomLine, addRouteStep, patchRouteStep, removeRouteStep, checkFeasibility,
      raisePurchaseRequest, buildSummary,
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
