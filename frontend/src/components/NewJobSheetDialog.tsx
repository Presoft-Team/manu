import { useEffect, useRef, useState } from 'react'
import {
  FileArrowUpIcon,
  KeyboardIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { Button, Field, cx, inputClass } from '@/components/ui'
import { SAMPLE_CSV, parseJobSheetFile, type ParsedGoal } from '@/lib/parseJobSheet'
import type { DemandSource } from '@/types'

type Mode = 'upload' | 'manual'

const SOURCE_OPTIONS: Array<{ value: DemandSource; label: string }> = [
  { value: 'sales_order', label: 'Sales order' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'rework', label: 'Rework' },
]

const ACCEPT = '.csv,.txt,.json'
const MAX_BYTES = 2 * 1024 * 1024

const blankGoal = (): ParsedGoal => ({ productCode: '', productName: '', targetQty: 0, unit: 'pcs' })

/** Default due date: four weeks out, which is the usual quote lead time here. */
function defaultDue() {
  const d = new Date()
  d.setDate(d.getDate() + 28)
  return d.toISOString().slice(0, 10)
}

/**
 * Two ways to get demand into the system: drop the customer's file on it, or type
 * it. Both land in the same review form, because an uploaded file is never
 * trusted straight into a job sheet, the planner confirms it first.
 */
export function NewJobSheetDialog({
  initialMode = 'upload',
  onClose,
  onCreated,
}: {
  initialMode?: Mode
  onClose: () => void
  onCreated: (jobSheetId: string) => void
}) {
  const { createJobSheet } = useMes()
  const fileInput = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>(initialMode)
  const [customer, setCustomer] = useState('')
  const [source, setSource] = useState<DemandSource>('sales_order')
  const [reference, setReference] = useState('')
  const [dueDate, setDueDate] = useState(defaultDue)
  const [goals, setGoals] = useState<ParsedGoal[]>([blankGoal()])

  const [fileName, setFileName] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const readFile = async (file: File) => {
    setError('')
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is larger than 2 MB. Export just the order lines.`)
      return
    }
    const text = await file.text()
    const parsed = parseJobSheetFile(file.name, text)

    setFileName(file.name)
    setWarnings(parsed.warnings)
    if (parsed.customer) setCustomer(parsed.customer)
    if (parsed.reference) setReference(parsed.reference)
    if (parsed.dueDate) setDueDate(parsed.dueDate)
    if (parsed.source) setSource(parsed.source)
    if (parsed.goals.length) setGoals(parsed.goals)
    setMode('manual') // straight to review, with everything filled in
  }

  const patchGoal = (index: number, patch: Partial<ParsedGoal>) =>
    setGoals((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)))

  const validGoals = goals.filter((g) => g.productName.trim() && g.targetQty > 0)
  const problems = [
    !customer.trim() && 'a client',
    !dueDate && 'a due date',
    validGoals.length === 0 && 'at least one item with a quantity',
  ].filter(Boolean) as string[]

  const submit = () => {
    setTouched(true)
    if (problems.length) return
    const id = createJobSheet({
      customer: customer.trim(),
      source,
      reference: reference.trim() || '—',
      dueDate,
      createdBy: 'Amirah Kamal',
      goals: validGoals.map((g) => ({
        productCode: g.productCode.trim() || g.productName.trim().toUpperCase().slice(0, 12),
        productName: g.productName.trim(),
        targetQty: g.targetQty,
        unit: g.unit.trim() || 'pcs',
      })),
    })
    onCreated(id)
    onClose()
  }

  return (
    <div
      className="animate-scrim-in fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 py-[8vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New job sheet"
        className="animate-layer-in flex max-h-[84vh] w-full max-w-[720px] flex-col rounded-[6px] border border-line-strong bg-panel shadow-2xl shadow-black/25"
      >
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
          <h2 className="text-[13px] font-semibold">New job sheet</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close">
            <XIcon size={14} weight="bold" />
          </button>
        </header>

        {/* -------------------------------------------------------- mode --- */}
        <div className="flex shrink-0 gap-1 border-b border-line px-3 py-2">
          <ModeTab
            active={mode === 'upload'}
            onClick={() => setMode('upload')}
            icon={<FileArrowUpIcon size={14} weight="bold" />}
            label="Upload job sheet"
          />
          <ModeTab
            active={mode === 'manual'}
            onClick={() => setMode('manual')}
            icon={<KeyboardIcon size={14} weight="bold" />}
            label="Input job sheet"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === 'upload' ? (
            <>
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const file = e.dataTransfer.files[0]
                  if (file) void readFile(file)
                }}
                className={cx(
                  'mesh relative flex cursor-pointer flex-col items-center gap-2 overflow-hidden',
                  'rounded-[6px] border border-dashed px-4 py-10 text-center',
                  'transition-all duration-200 ease-spring',
                  dragging
                    ? 'border-accent bg-accent-soft glow-accent'
                    : 'border-line-strong hover:border-accent hover:glow-accent',
                )}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void readFile(file)
                    e.target.value = ''
                  }}
                />
                <FileArrowUpIcon size={30} weight="light" className="text-accent" />
                <span className="text-[13px] font-medium">
                  Drop a customer order here, or click to browse
                </span>
                <span className="text-[12px] text-text-dim">CSV, TSV or JSON, up to 2 MB</span>
              </label>

              {error && (
                <p className="mt-3 flex items-start gap-2 rounded-[6px] border border-st-stopped/40 bg-st-stopped/10 px-2.5 py-2 text-[12px] text-st-stopped">
                  <WarningCircleIcon size={14} weight="fill" className="mt-px shrink-0" />
                  {error}
                </p>
              )}

              <div className="mt-4 rounded-[6px] border border-line bg-panel-2/40 p-3">
                <h3 className="text-[12px] font-medium">Expected format</h3>
                <p className="mt-1 text-[12px] text-text-dim">
                  Meta rows first, then a header row, then one row per item. Column names are matched
                  loosely, so <span className="num">qty</span>, <span className="num">quantity</span>{' '}
                  and <span className="num">target_qty</span> all work.
                </p>
                <pre className="num mt-2 overflow-x-auto rounded-[4px] border border-line bg-panel p-2.5 text-[12px] leading-relaxed text-text-dim">
                  {SAMPLE_CSV}
                </pre>
                <p className="mt-2 text-[12px] text-text-dim">
                  Anything the parser cannot read is flagged for you to fix, never dropped silently.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {fileName && (
                <p className="flex items-center gap-2 rounded-[6px] border border-accent/35 bg-accent-soft px-2.5 py-2 text-[12px] text-accent">
                  <FileArrowUpIcon size={14} weight="bold" className="shrink-0" />
                  Read from <span className="num font-medium">{fileName}</span>. Check it before
                  creating the sheet.
                </p>
              )}

              {warnings.length > 0 && (
                <ul className="rounded-[6px] border border-st-running/40 bg-st-running/10 px-3 py-2 text-[12px] text-st-running">
                  {warnings.map((w) => (
                    <li key={w} className="flex items-start gap-2">
                      <WarningCircleIcon size={13} weight="fill" className="mt-0.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Client">
                  <input
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    placeholder="Kenyalang Autoparts Sdn Bhd"
                    className={inputClass}
                  />
                </Field>
                <Field label="Source">
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as DemandSource)}
                    className={inputClass}
                  >
                    {SOURCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reference" hint="Sales order, forecast run or rework number.">
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="SO-88274"
                    className={cx(inputClass, 'num')}
                  />
                </Field>
                <Field label="Due date">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={cx(inputClass, 'num')}
                  />
                </Field>
              </div>

              {/* ------------------------------------------------- goals --- */}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">
                    Goal
                  </h3>
                  <Button
                    onClick={() => setGoals((prev) => [...prev, blankGoal()])}
                    icon={<PlusIcon size={13} weight="bold" />}
                  >
                    Add item
                  </Button>
                </div>

                <div className="mt-2 overflow-hidden rounded-[6px] border border-line">
                  <table className="w-full">
                    <thead className="bg-panel-2/60">
                      <tr>
                        <th className="w-[150px] px-2 py-1.5 text-left text-[12px] font-medium text-text-faint">
                          Item id
                        </th>
                        <th className="px-2 py-1.5 text-left text-[12px] font-medium text-text-faint">
                          Item name
                        </th>
                        <th className="w-[96px] px-2 py-1.5 text-right text-[12px] font-medium text-text-faint">
                          Qty
                        </th>
                        <th className="w-[76px] px-2 py-1.5 text-left text-[12px] font-medium text-text-faint">
                          Unit
                        </th>
                        <th className="w-[40px]" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {goals.map((goal, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5">
                            <input
                              value={goal.productCode}
                              onChange={(e) => patchGoal(i, { productCode: e.target.value })}
                              placeholder="FG-BRKT-220"
                              className={cx(inputClass, 'num py-1')}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={goal.productName}
                              onChange={(e) => patchGoal(i, { productName: e.target.value })}
                              placeholder="Mounting bracket"
                              className={cx(inputClass, 'py-1')}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={0}
                              value={goal.targetQty || ''}
                              onChange={(e) => patchGoal(i, { targetQty: Number(e.target.value) || 0 })}
                              className={cx(inputClass, 'num py-1 text-right')}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={goal.unit}
                              onChange={(e) => patchGoal(i, { unit: e.target.value })}
                              className={cx(inputClass, 'py-1')}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() =>
                                setGoals((prev) =>
                                  prev.length === 1 ? [blankGoal()] : prev.filter((_, j) => j !== i),
                                )
                              }
                              className="text-text-faint hover:text-st-stopped"
                              aria-label={`Remove item ${i + 1}`}
                            >
                              <TrashIcon size={14} weight="bold" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {touched && problems.length > 0 && (
                <p className="flex items-start gap-2 rounded-[6px] border border-st-stopped/40 bg-st-stopped/10 px-2.5 py-2 text-[12px] text-st-stopped">
                  <WarningCircleIcon size={14} weight="fill" className="mt-px shrink-0" />
                  Still needs {problems.join(', ')}.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-2.5">
          {mode === 'manual' && validGoals.length > 0 && (
            <span className="num mr-auto text-[12px] text-text-faint">
              {validGoals.length} item{validGoals.length > 1 ? 's' : ''} ready
            </span>
          )}
          <Button onClick={onClose}>Cancel</Button>
          {mode === 'upload' ? (
            <Button variant="primary" onClick={() => fileInput.current?.click()}>
              Choose file
            </Button>
          ) : (
            <Button variant="primary" onClick={submit}>
              Create job sheet
            </Button>
          )}
        </footer>
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px] transition-colors duration-150',
        active
          ? 'border-accent bg-accent-soft font-medium text-accent'
          : 'border-line-strong text-text-dim hover:bg-panel-2 hover:text-text',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
