import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { MACHINES } from '@/data/seed'
import { machineLoad } from '@/lib/analytics'
import { fmtDateTime } from '@/lib/format'
import { cx } from '@/components/ui'
import type { WorkOrder } from '@/types'

const DAY_MS = 86400000
const MIN_MS = 60000
/** Slots land on the half hour. Finer than that is false precision on a shop floor. */
const SNAP_MIN = 30
/** Shortest window worth drawing. A one-day strip reads as a bar chart, not a plan. */
const MIN_DAYS = 7
const MAX_DAYS = 21

/** A move in progress, before it is committed to the store. */
interface Drag {
  code: string
  /** Row the bar is currently hovering over. */
  machineIndex: number
  startMs: number
  endMs: number
  moved: boolean
}

/**
 * Every machine in the plant against one time axis, so a slot is booked with the
 * rest of the floor in view rather than in isolation.
 *
 * The window starts at the earliest booked slot rather than at today: an order
 * that started yesterday is still occupying its machine, and hiding its bar
 * while still counting its hours is how a schedule starts lying.
 *
 * When `editable` names a work order, that bar can be dragged — sideways to move
 * it in time, up and down to move it to another machine. Nothing is written
 * until the drag ends, and the store rejects a drop that double-books a machine.
 */
export function MachineSchedule({
  workOrders,
  highlight,
  editable,
  onMove,
}: {
  workOrders: WorkOrder[]
  /** Work order code to pull forward. Its bar is filled; the rest recede. */
  highlight?: string
  /** Work order code the planner is allowed to drag. */
  editable?: string
  onMove?: (machine: string, startsAt: string) => void
}) {
  const load = machineLoad(workOrders, MACHINES)
  const tracks = useRef<Array<HTMLDivElement | null>>([])
  const [drag, setDrag] = useState<Drag | null>(null)

  const all = load.flatMap((m) => m.slots)

  if (all.length === 0) {
    return (
      <p className="text-[12px] text-text-dim">
        Nothing is booked on any machine yet. The first slot booked draws the strip.
      </p>
    )
  }

  const earliest = Math.min(Date.now(), ...all.map((s) => new Date(s.startsAt).getTime()))
  const latest = Math.max(...all.map((s) => new Date(s.endsAt).getTime()))

  const start = new Date(earliest)
  start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()

  const spanDays = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.ceil((latest - startMs) / DAY_MS)))
  const spanMs = spanDays * DAY_MS
  const days = Array.from({ length: spanDays }, (_, i) => new Date(startMs + i * DAY_MS))

  /* Today's position on the axis, so "now" is readable against the bars. */
  const nowPct = ((Date.now() - startMs) / spanMs) * 100

  const snap = (ms: number) => Math.round(ms / (SNAP_MIN * MIN_MS)) * (SNAP_MIN * MIN_MS)

  /** Which row the pointer is over, falling back to the row the drag began on. */
  const rowAt = (clientY: number, fallback: number) => {
    for (let i = 0; i < tracks.current.length; i += 1) {
      const rect = tracks.current[i]?.getBoundingClientRect()
      if (rect && clientY >= rect.top && clientY <= rect.bottom) return i
    }
    return fallback
  }

  const beginDrag = (
    e: PointerEvent<HTMLDivElement>,
    code: string,
    machineIndex: number,
    slotStart: number,
    slotEnd: number,
  ) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const track = tracks.current[machineIndex]
    if (!track) return

    const originX = e.clientX
    const width = track.getBoundingClientRect().width
    const msPerPx = spanMs / width
    const duration = slotEnd - slotStart

    setDrag({ code, machineIndex, startMs: slotStart, endMs: slotEnd, moved: false })

    const move = (ev: globalThis.PointerEvent) => {
      const shifted = snap(slotStart + (ev.clientX - originX) * msPerPx)
      const row = rowAt(ev.clientY, machineIndex)
      setDrag({
        code,
        machineIndex: row,
        startMs: shifted,
        endMs: shifted + duration,
        moved: true,
      })
    }

    const end = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)

      const shifted = snap(slotStart + (ev.clientX - originX) * msPerPx)
      const row = rowAt(ev.clientY, machineIndex)
      setDrag(null)
      /* A click that never moved is not a reschedule. */
      if (shifted !== slotStart || row !== machineIndex) {
        onMove?.(load[row].machine, new Date(shifted).toISOString())
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /** Keyboard equivalent: an hour per press sideways, a machine per press vertically. */
  const onKey = (
    e: KeyboardEvent<HTMLDivElement>,
    machineIndex: number,
    slotStart: number,
  ) => {
    const step =
      e.key === 'ArrowRight' ? 3600000 : e.key === 'ArrowLeft' ? -3600000 : null
    const row =
      e.key === 'ArrowDown'
        ? Math.min(load.length - 1, machineIndex + 1)
        : e.key === 'ArrowUp'
          ? Math.max(0, machineIndex - 1)
          : machineIndex

    if (step === null && row === machineIndex) return
    e.preventDefault()
    onMove?.(load[row].machine, new Date(slotStart + (step ?? 0)).toISOString())
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex items-end gap-3 pb-1.5">
          <div className="w-[132px] shrink-0" />
          <div className="flex flex-1">
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className="num flex-1 border-l border-line pl-1 text-[12px] text-text-faint"
              >
                {d.getDate()}
              </div>
            ))}
          </div>
        </div>

        <ul className="flex flex-col gap-1.5">
          {load.map((m, machineIndex) => {
            /* The dragged bar is drawn on whichever row the pointer is over. */
            const incoming = drag && drag.machineIndex === machineIndex ? drag : null

            return (
              <li key={m.machine} className="flex items-center gap-3">
                <div className="w-[132px] shrink-0">
                  <div className="num truncate text-[12px]">{m.machine.split(' / ')[0]}</div>
                  <div className="num truncate text-[12px] text-text-faint">
                    {m.hours ? `${m.hours} h booked` : 'free'}
                  </div>
                </div>

                <div
                  ref={(el) => {
                    tracks.current[machineIndex] = el
                  }}
                  className={cx(
                    'relative h-7 flex-1 overflow-hidden rounded-[4px] bg-panel-2',
                    incoming && 'ring-1 ring-accent/45',
                  )}
                >
                  {days.map((d, i) => (
                    <div
                      key={d.toISOString()}
                      className="absolute top-0 bottom-0 border-l border-line"
                      style={{ left: `${(i / spanDays) * 100}%` }}
                      aria-hidden
                    />
                  ))}

                  {nowPct >= 0 && nowPct <= 100 && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-accent/60"
                      style={{ left: `${nowPct}%` }}
                      aria-hidden
                    />
                  )}

                  {m.slots.map((slot) => {
                    const dragging = drag?.code === slot.workOrderCode
                    /* While dragging, the bar is drawn from the drag state, and
                       only on the row the pointer is over. */
                    if (dragging && drag.machineIndex !== machineIndex) return null

                    const from = dragging ? drag.startMs : new Date(slot.startsAt).getTime()
                    const to = dragging ? drag.endMs : new Date(slot.endsAt).getTime()
                    const left = Math.max(0, ((from - startMs) / spanMs) * 100)
                    const right = Math.min(100, ((to - startMs) / spanMs) * 100)
                    if (right <= 0 || left >= 100) return null

                    const mine = highlight === slot.workOrderCode
                    const canDrag = editable === slot.workOrderCode

                    return (
                      <div
                        key={slot.workOrderCode}
                        role={canDrag ? 'button' : undefined}
                        tabIndex={canDrag ? 0 : undefined}
                        aria-label={
                          canDrag
                            ? `${slot.workOrderCode} on ${m.machine}, ${fmtDateTime(slot.startsAt)}. Arrow keys move it by an hour, or to another machine.`
                            : undefined
                        }
                        onPointerDown={
                          canDrag
                            ? (e) =>
                                beginDrag(
                                  e,
                                  slot.workOrderCode,
                                  machineIndex,
                                  new Date(slot.startsAt).getTime(),
                                  new Date(slot.endsAt).getTime(),
                                )
                            : undefined
                        }
                        onKeyDown={
                          canDrag
                            ? (e) => onKey(e, machineIndex, new Date(slot.startsAt).getTime())
                            : undefined
                        }
                        title={`${slot.workOrderCode} · ${fmtDateTime(
                          dragging ? new Date(drag.startMs).toISOString() : slot.startsAt,
                        )} → ${fmtDateTime(
                          dragging ? new Date(drag.endMs).toISOString() : slot.endsAt,
                        )}${canDrag ? ' · drag to reschedule' : ''}`}
                        className={cx(
                          'absolute top-1 bottom-1 flex items-center overflow-hidden rounded-[4px] border px-1.5',
                          mine
                            ? 'z-10 border-accent bg-accent text-accent-fg shadow-sm'
                            : slot.status === 'stopped'
                              ? 'border-st-stopped/40 bg-st-stopped/20 text-st-stopped'
                              : slot.status === 'running'
                                ? 'border-st-running/40 bg-st-running/20 text-st-running'
                                : slot.autoScheduled
                                  ? 'border-accent/45 bg-accent-soft text-accent'
                                  : 'border-line-strong bg-panel text-text-dim',
                          highlight && !mine && 'opacity-55',
                          canDrag && 'cursor-grab touch-none select-none',
                          dragging && 'z-20 cursor-grabbing shadow-md ring-2 ring-accent/40',
                          // Snapping to the half hour looks wrong if the bar eases into place.
                          !dragging && 'transition-all duration-200 ease-spring',
                        )}
                        style={{ left: `${left}%`, width: `${Math.max(1.5, right - left)}%` }}
                      >
                        <span className="num truncate text-[12px] leading-none">
                          {slot.workOrderCode}
                        </span>
                      </div>
                    )
                  })}

                  {/*
                    Dragged onto a machine it is not booked on yet: that row has no
                    slot to draw, so the bar in flight is drawn here instead.
                  */}
                  {incoming && !m.slots.some((s) => s.workOrderCode === incoming.code) && (
                    <div
                      className="absolute top-1 bottom-1 z-20 flex items-center overflow-hidden rounded-[4px] border border-accent bg-accent px-1.5 text-accent-fg shadow-md ring-2 ring-accent/40"
                      style={{
                        left: `${Math.max(0, ((incoming.startMs - startMs) / spanMs) * 100)}%`,
                        width: `${Math.max(
                          1.5,
                          Math.min(100, ((incoming.endMs - startMs) / spanMs) * 100) -
                            Math.max(0, ((incoming.startMs - startMs) / spanMs) * 100),
                        )}%`,
                      }}
                      aria-hidden
                    >
                      <span className="num truncate text-[12px] leading-none">{incoming.code}</span>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12px] text-text-faint">
          {highlight && <Key className="border-accent bg-accent" label="this order" />}
          <Key className="border-accent/45 bg-accent-soft" label="auto-scheduled" />
          <Key className="border-line-strong bg-panel" label="planner booked" />
          <Key className="border-st-running/40 bg-st-running/20" label="running" />
          <Key className="border-st-stopped/40 bg-st-stopped/20" label="stopped" />
        </div>

        {drag?.moved && (
          <p className="num mt-2 text-[12px] text-accent">
            {drag.code} → {load[drag.machineIndex].machine.split(' / ')[0]},{' '}
            {fmtDateTime(new Date(drag.startMs).toISOString())} to{' '}
            {fmtDateTime(new Date(drag.endMs).toISOString())}
          </p>
        )}
      </div>
    </div>
  )
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('h-3 w-5 rounded-[3px] border', className)} aria-hidden />
      {label}
    </span>
  )
}
