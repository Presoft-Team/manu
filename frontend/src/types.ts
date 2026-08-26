/**
 * Domain model for the job-sheet flow in flowchart.md.
 *
 * Lifecycle enforced by the UI:
 *   job sheet  draft -> pending_approval -> approved -> in_progress -> completed
 *                                       \-> rejected (back to draft)
 *   work order draft -> confirmed -> released -> running -> stopped -> completed
 *
 * Locking rule: a confirmed work order is immutable. A confirmed (pending/approved)
 * job sheet is immutable, including every work order inside it.
 */

export type DemandSource = 'sales_order' | 'forecast' | 'rework'

export type JobSheetStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'rejected'

export type WorkOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'released'
  | 'running'
  | 'stopped'
  | 'completed'

/** Which branch of the flowchart built this work order. */
export type BuildMode = 'ai' | 'manual'

export type FeasibilityState = 'ok' | 'shortage' | 'unchecked'

export interface BomLine {
  id: string
  materialCode: string
  name: string
  requiredPerUnit: number
  requiredQty: number
  unit: string
  onHandQty: number
  unitCost: number
  /** Set when this line came from the AI auto-assign path. */
  aiAssigned?: boolean
}

export interface RouteStep {
  id: string
  seq: number
  operation: string
  workCentre: string
  machine: string
  setupMin: number
  cycleSecPerUnit: number
  aiAssigned?: boolean
}

export interface MachineSlot {
  machine: string
  startsAt: string
  endsAt: string
  /** AI auto-schedule wrote this slot rather than a planner. */
  autoScheduled: boolean
}

export interface ProductionSummary {
  expectedOutput: number
  scrapAllowance: number
  materialCost: number
  labourCost: number
  overheadCost: number
  totalCost: number
  runHours: number
}

export interface PurchaseRequest {
  id: string
  materialCode: string
  shortfallQty: number
  unit: string
  raisedAt: string
  managerAlerted: boolean
}

export interface WorkOrder {
  id: string
  code: string
  jobSheetId: string
  /** Goal line from the job sheet this work order is fulfilling. */
  goalId: string
  qty: number
  unit: string
  mode: BuildMode
  status: WorkOrderStatus
  /** Selected BOM_LIBRARY id. The machine slot stays locked until both are set. */
  bomTemplateId: string | null
  /** Selected ROUTE_LIBRARY id. */
  routeTemplateId: string | null
  bom: BomLine[]
  route: RouteStep[]
  slot: MachineSlot | null
  summary: ProductionSummary | null
  feasibility: FeasibilityState
  purchaseRequests: PurchaseRequest[]
  createdAt: string
  confirmedAt: string | null
  notes: string
}

/** A quantity target on the job sheet. Work orders draw down against it. */
export interface JobSheetGoal {
  id: string
  productCode: string
  productName: string
  targetQty: number
  unit: string
}

export interface JobSheet {
  id: string
  code: string
  source: DemandSource
  reference: string
  customer: string
  createdBy: string
  createdAt: string
  /** Last write of any kind: sheet fields, its work orders, or a status move. */
  lastModifiedAt: string
  dueDate: string
  status: JobSheetStatus
  goals: JobSheetGoal[]
  workOrderIds: string[]
  approvedBy: string | null
  rejectionReason: string | null
  /** Set when a rework work order spawned this sheet (flowchart step 8). */
  parentWorkOrderCode?: string
}

export type ShiftCode = 'A' | 'B' | 'C'

export type StaffRunStatus = 'running' | 'paused' | 'done'

/** One operator's turn on a work order: the WIP record from flowchart step 7. */
export interface StaffRun {
  id: string
  workOrderId: string
  operatorId: string
  operatorName: string
  shift: ShiftCode
  operation: string
  machine: string
  startedAt: string
  endedAt: string | null
  status: StaffRunStatus
  /** Good units accepted. */
  qtyDone: number
  /** Defective units. "Rosak" on the shop floor terminal. */
  qtyRosak: number
  /** Material consumed but unrecoverable. */
  qtyWaste: number
  downtimeMin: number
  downtimeReason: string | null
  supervisorCalled: boolean
}
