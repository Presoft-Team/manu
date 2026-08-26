import { useEffect, useState } from 'react'
import {
  HandPointingIcon,
  LightbulbFilamentIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { Button, Field, cx, inputClass } from '@/components/ui'
import { fmtInt } from '@/lib/format'
import type { BuildMode, JobSheet } from '@/types'

/**
 * Add-work-order gate. This is the branch point in the flowchart: the AI path
 * auto-assigns BOM and route from the part family, the manual path opens an
 * empty work order for the planner to build by hand.
 */
export function NewWorkOrderDialog({
  sheet,
  onClose,
  onCreated,
}: {
  sheet: JobSheet
  onClose: () => void
  onCreated: (workOrderId: string) => void
}) {
  const { addWorkOrder, remainingByGoal } = useMes()
  const remaining = remainingByGoal(sheet.id)

  const [mode, setMode] = useState<BuildMode>('ai')
  const [goalId, setGoalId] = useState(sheet.goals[0]?.id ?? '')
  const [qty, setQty] = useState(() => Math.max(1, remaining[sheet.goals[0]?.id ?? ''] ?? 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const goal = sheet.goals.find((g) => g.id === goalId)
  const left = remaining[goalId] ?? 0
  const over = qty > left

  const submit = () => {
    const id = addWorkOrder(sheet.id, mode, goalId, qty)
    if (id) onCreated(id)
    onClose()
  }

  return (
    <div
      className="animate-scrim-in fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 py-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add work order"
        className="animate-layer-in w-full max-w-[520px] rounded-[6px] border border-line-strong bg-panel shadow-2xl shadow-black/25"
      >
        <header className="flex h-11 items-center justify-between border-b border-line px-3">
          <h2 className="text-[13px] font-semibold">Add work order</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close">
            <XIcon size={14} weight="bold" />
          </button>
        </header>

        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <ModeOption
              active={mode === 'ai'}
              onClick={() => setMode('ai')}
              icon={<LightbulbFilamentIcon size={18} weight="fill" />}
              title="AI assign"
              body="Pulls BOM and route from the matching part family, then books a machine slot."
            />
            <ModeOption
              active={mode === 'manual'}
              onClick={() => setMode('manual')}
              icon={<HandPointingIcon size={18} weight="bold" />}
              title="Manual"
              body="Opens an empty work order. You pick every material line and route step."
            />
          </div>

          <Field label="Target goal" hint="Remaining quantity is the job sheet target minus existing work orders.">
            <select
              value={goalId}
              onChange={(e) => {
                setGoalId(e.target.value)
                setQty(Math.max(1, remaining[e.target.value] ?? 1))
              }}
              className={inputClass}
            >
              {sheet.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.productCode} · {g.productName} · {fmtInt(remaining[g.id] ?? 0)} {g.unit} left
                </option>
              ))}
            </select>
          </Field>

          <Field label="Order quantity">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className={cx(inputClass, 'num w-40 text-right')}
              />
              <span className="text-[12px] text-text-dim">
                {goal?.unit} of {fmtInt(left)} remaining
              </span>
            </div>
          </Field>

          {over && (
            <p className="rounded-[6px] border border-st-stopped/40 bg-st-stopped/10 px-2.5 py-2 text-[12px] text-st-stopped">
              This quantity exceeds the remaining goal by {fmtInt(qty - left)} {goal?.unit}. The job
              sheet will be over-produced.
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-3 py-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!goalId}>
            Create work order
          </Button>
        </footer>
      </div>
    </div>
  )
}

function ModeOption({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'rounded-[6px] border p-3 text-left transition-colors duration-150',
        active
          ? 'border-accent bg-accent-soft'
          : 'border-line-strong hover:bg-panel-2',
      )}
    >
      <span className={cx('flex items-center gap-1.5', active ? 'text-accent' : 'text-text-dim')}>
        {icon}
        <span className="text-[13px] font-medium">{title}</span>
      </span>
      <span className="mt-1 block text-[12px] text-text-dim">{body}</span>
    </button>
  )
}
