import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { JobSheetStatus, StaffRunStatus, WorkOrderStatus } from '@/types'

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ')

/* ---------------------------------------------------------------- Button --- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-panel text-text border border-line-strong hover:bg-panel-2',
  ghost: 'text-text-dim hover:text-text hover:bg-panel-2',
  danger: 'text-st-stopped border border-st-stopped/40 hover:bg-st-stopped/10',
}

export function Button({
  variant = 'secondary',
  icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 py-1.5',
        'text-[13px] font-medium transition-colors duration-150',
        'active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/* ----------------------------------------------------------------- Panel --- */

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('rounded-[6px] border border-line bg-panel', className)}>
      {title && (
        <header className="flex h-10 items-center justify-between gap-3 border-b border-line px-3">
          <h2 className="text-[12px] font-semibold tracking-wide text-text-dim uppercase">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/* ----------------------------------------------------------------- Badge --- */

const JOB_SHEET_LABEL: Record<JobSheetStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
}

const JOB_SHEET_TONE: Record<JobSheetStatus, string> = {
  draft: 'text-st-draft border-st-draft/35 bg-st-draft/8',
  pending_approval: 'text-st-hold border-st-hold/35 bg-st-hold/10',
  approved: 'text-st-confirmed border-st-confirmed/35 bg-st-confirmed/10',
  in_progress: 'text-st-running border-st-running/40 bg-st-running/10',
  completed: 'text-st-done border-st-done/35 bg-st-done/10',
  rejected: 'text-st-stopped border-st-stopped/35 bg-st-stopped/10',
}

const WORK_ORDER_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  released: 'Released',
  running: 'Running',
  stopped: 'Stopped',
  completed: 'Completed',
}

const WORK_ORDER_TONE: Record<WorkOrderStatus, string> = {
  draft: 'text-st-draft border-st-draft/35 bg-st-draft/8',
  confirmed: 'text-st-confirmed border-st-confirmed/35 bg-st-confirmed/10',
  released: 'text-st-confirmed border-st-confirmed/35 bg-st-confirmed/10',
  running: 'text-st-running border-st-running/40 bg-st-running/10',
  stopped: 'text-st-stopped border-st-stopped/35 bg-st-stopped/10',
  completed: 'text-st-done border-st-done/35 bg-st-done/10',
}

const RUN_LABEL: Record<StaffRunStatus, string> = {
  running: 'Running',
  paused: 'Paused',
  done: 'Done',
}

const RUN_TONE: Record<StaffRunStatus, string> = {
  running: 'text-st-running border-st-running/40 bg-st-running/10',
  paused: 'text-st-stopped border-st-stopped/35 bg-st-stopped/10',
  done: 'text-st-done border-st-done/35 bg-st-done/10',
}

export function JobSheetBadge({ status }: { status: JobSheetStatus }) {
  return <Badge tone={JOB_SHEET_TONE[status]}>{JOB_SHEET_LABEL[status]}</Badge>
}

export function WorkOrderBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge tone={WORK_ORDER_TONE[status]}>{WORK_ORDER_LABEL[status]}</Badge>
}

export function RunBadge({ status }: { status: StaffRunStatus }) {
  return <Badge tone={RUN_TONE[status]}>{RUN_LABEL[status]}</Badge>
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-[4px] border px-1.5 py-0.5',
        'text-[11px] leading-none font-medium',
        tone,
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------- Data cell --- */

export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: string
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[11px] text-text-faint">{label}</div>
      <div className={cx('num mt-0.5 text-[17px] leading-tight font-medium', tone ?? 'text-text')}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-text-faint">{hint}</div>}
    </div>
  )
}

/* ----------------------------------------------------------------- Input --- */

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-dim">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-text-faint">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-[6px] border border-line-strong bg-panel px-2 py-1.5 text-[13px] text-text ' +
  'placeholder:text-text-faint focus:border-accent focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-text-dim'

/* ----------------------------------------------------------- Empty state --- */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="text-text-faint">{icon}</div>
      <p className="text-[14px] font-medium text-text">{title}</p>
      <p className="max-w-[46ch] text-[13px] text-text-dim">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
