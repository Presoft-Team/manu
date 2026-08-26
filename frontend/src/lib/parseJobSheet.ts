import type { DemandSource } from '@/types'

/**
 * Reads a job sheet out of a customer file so the planner does not retype it.
 *
 * CSV shape: optional two-column meta rows first, then a header row, then goals.
 *
 *   customer, Kenyalang Autoparts Sdn Bhd
 *   reference, SO-88274
 *   due, 2026-09-08
 *   product_code, product_name, qty, unit
 *   FG-BRKT-220, Mounting bracket anthracite, 2400, pcs
 *
 * JSON shape: either a bare array of goals, or an object with the same meta keys
 * plus a `goals` array. Anything it cannot read comes back as a warning rather
 * than an exception: a partial parse the planner can correct beats a rejection.
 */

export interface ParsedGoal {
  productCode: string
  productName: string
  targetQty: number
  unit: string
}

export interface ParsedJobSheet {
  customer: string
  reference: string
  dueDate: string
  source: DemandSource | null
  goals: ParsedGoal[]
  warnings: string[]
}

const META_KEYS: Record<string, keyof Pick<ParsedJobSheet, 'customer' | 'reference' | 'dueDate' | 'source'>> = {
  customer: 'customer',
  client: 'customer',
  'customer name': 'customer',
  reference: 'reference',
  ref: 'reference',
  'order no': 'reference',
  'order number': 'reference',
  'so number': 'reference',
  due: 'dueDate',
  'due date': 'dueDate',
  deadline: 'dueDate',
  source: 'source',
  type: 'source',
}

const COLUMN_KEYS: Record<string, keyof ParsedGoal> = {
  'product code': 'productCode',
  product_code: 'productCode',
  productcode: 'productCode',
  code: 'productCode',
  'item code': 'productCode',
  item_code: 'productCode',
  sku: 'productCode',
  'product name': 'productName',
  product_name: 'productName',
  productname: 'productName',
  name: 'productName',
  item: 'productName',
  description: 'productName',
  qty: 'targetQty',
  quantity: 'targetQty',
  'target qty': 'targetQty',
  target_qty: 'targetQty',
  unit: 'unit',
  uom: 'unit',
}

const SOURCES: Record<string, DemandSource> = {
  sales_order: 'sales_order',
  'sales order': 'sales_order',
  so: 'sales_order',
  forecast: 'forecast',
  fc: 'forecast',
  rework: 'rework',
  rw: 'rework',
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Split one CSV row, honouring "quoted, fields". */
function splitRow(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',' || ch === ';' || ch === '\t') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell.trim())
  return cells
}

/** Accepts 2026-09-08, 08/09/2026 and 8 Sep 2026. Returns an ISO date or ''. */
function toIsoDate(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slash) {
    const [, d, m, y] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function toQty(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function empty(): ParsedJobSheet {
  return { customer: '', reference: '', dueDate: '', source: null, goals: [], warnings: [] }
}

function applyMeta(result: ParsedJobSheet, key: string, value: string) {
  const field = META_KEYS[norm(key)]
  if (!field || !value) return false
  if (field === 'source') {
    result.source = SOURCES[norm(value)] ?? null
    if (!result.source) result.warnings.push(`Unknown source "${value}", defaulting to sales order.`)
  } else if (field === 'dueDate') {
    const iso = toIsoDate(value)
    if (iso) result.dueDate = iso
    else result.warnings.push(`Could not read the due date "${value}".`)
  } else {
    result[field] = value
  }
  return true
}

function parseCsv(text: string): ParsedJobSheet {
  const result = empty()
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(splitRow)

  let columns: Array<keyof ParsedGoal | null> | null = null

  for (const row of rows) {
    // Before the table: two-column meta rows such as "customer, Acme Sdn Bhd".
    if (!columns && row.length >= 2 && applyMeta(result, row[0], row.slice(1).join(', '))) continue

    const mapped = row.map((c) => COLUMN_KEYS[norm(c)] ?? null)
    const isHeader = mapped.filter(Boolean).length >= 2
    if (isHeader) {
      columns = mapped
      continue
    }
    if (!columns) continue

    const goal: ParsedGoal = { productCode: '', productName: '', targetQty: 0, unit: 'pcs' }
    columns.forEach((field, i) => {
      const value = row[i] ?? ''
      if (!field || !value) return
      if (field === 'targetQty') goal.targetQty = toQty(value)
      else goal[field] = value
    })

    if (!goal.productCode && !goal.productName) continue
    if (!goal.productName) goal.productName = goal.productCode
    if (!goal.productCode) goal.productCode = goal.productName.toUpperCase().slice(0, 12)
    if (goal.targetQty <= 0) result.warnings.push(`${goal.productCode} has no quantity, set it below.`)
    result.goals.push(goal)
  }

  if (!columns) {
    result.warnings.push(
      'No item table found. Expected a header row with product code, name, qty and unit.',
    )
  }
  return result
}

function parseJson(text: string): ParsedJobSheet {
  const result = empty()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    result.warnings.push('This file is not valid JSON.')
    return result
  }

  const body = (Array.isArray(data) ? { goals: data } : data) as Record<string, unknown>
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') applyMeta(result, key, value)
  }

  const rawGoals = Array.isArray(body.goals) ? body.goals : []
  for (const raw of rawGoals) {
    const row = raw as Record<string, unknown>
    const goal: ParsedGoal = { productCode: '', productName: '', targetQty: 0, unit: 'pcs' }
    for (const [key, value] of Object.entries(row)) {
      const field = COLUMN_KEYS[norm(key)]
      if (!field || value == null) continue
      if (field === 'targetQty') goal.targetQty = toQty(String(value))
      else goal[field] = String(value)
    }
    if (!goal.productCode && !goal.productName) continue
    if (!goal.productName) goal.productName = goal.productCode
    if (!goal.productCode) goal.productCode = goal.productName.toUpperCase().slice(0, 12)
    result.goals.push(goal)
  }

  if (result.goals.length === 0) result.warnings.push('No goals found in this file.')
  return result
}

export function parseJobSheetFile(fileName: string, text: string): ParsedJobSheet {
  const result = fileName.toLowerCase().endsWith('.json') ? parseJson(text) : parseCsv(text)

  // A filename like SO-88274.csv is a better reference than nothing.
  if (!result.reference) {
    const stem = fileName.replace(/\.[^.]+$/, '').trim()
    if (stem) result.reference = stem
  }
  if (!result.source) result.source = 'sales_order'
  return result
}

export const SAMPLE_CSV = `customer, Kenyalang Autoparts Sdn Bhd
reference, SO-88274
due, 2026-09-08
product_code, product_name, qty, unit
FG-BRKT-220, Mounting bracket anthracite, 2400, pcs
FG-HUB-A19, Idler hub assembly, 640, pcs`
