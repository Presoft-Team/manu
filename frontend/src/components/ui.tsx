import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { CheckCircleIcon } from '@phosphor-icons/react'
import type { JobSheetStatus, StaffRunStatus, WorkOrderStatus } from '@/types'

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ')

/* ---------------------------------------------------------------- Button --- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  // Primary carries an ambient glow rather than a cast shadow, so it reads as lit.
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover glow-accent hover:glow-accent-strong',
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
        'text-[13px] font-medium transition-all duration-200 ease-spring',
        'active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
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

/*
  Three tiers, so twelve statuses read as three ideas at a glance:
    ghost   waiting on someone. Outline only, no fill, recedes.
    active  moving right now. Filled, with a pulsing dot to catch the eye.
    solid   settled. Filled, and allowed to fade into the hierarchy.
*/
type Tier = 'ghost' | 'active' | 'solid'

const JOB_SHEET_LABEL: Record<JobSheetStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
}

const JOB_SHEET_STYLE: Record<JobSheetStatus, { tier: Tier; tone: string }> = {
  draft: { tier: 'ghost', tone: 'text-st-draft border-st-draft/40' },
  pending_approval: { tier: 'ghost', tone: 'text-st-hold border-st-hold/45' },
  approved: { tier: 'solid', tone: 'text-st-confirmed border-st-confirmed/35 bg-st-confirmed/10' },
  in_progress: { tier: 'active', tone: 'text-st-running border-st-running/40 bg-st-running/10' },
  completed: { tier: 'solid', tone: 'text-st-done border-st-done/35 bg-st-done/10' },
  rejected: { tier: 'solid', tone: 'text-st-stopped border-st-stopped/40 bg-st-stopped/10' },
}

const WORK_ORDER_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  released: 'Released',
  running: 'Running',
  stopped: 'Stopped',
  completed: 'Completed',
}

const WORK_ORDER_STYLE: Record<WorkOrderStatus, { tier: Tier; tone: string }> = {
  draft: { tier: 'ghost', tone: 'text-st-draft border-st-draft/40' },
  confirmed: { tier: 'solid', tone: 'text-st-confirmed border-st-confirmed/35 bg-st-confirmed/10' },
  released: { tier: 'ghost', tone: 'text-st-confirmed border-st-confirmed/45' },
  running: { tier: 'active', tone: 'text-st-running border-st-running/40 bg-st-running/10' },
  stopped: { tier: 'solid', tone: 'text-st-stopped border-st-stopped/40 bg-st-stopped/10' },
  completed: { tier: 'solid', tone: 'text-st-done border-st-done/35 bg-st-done/10' },
}

const RUN_LABEL: Record<StaffRunStatus, string> = {
  running: 'Running',
  paused: 'Paused',
  done: 'Done',
}

const RUN_STYLE: Record<StaffRunStatus, { tier: Tier; tone: string }> = {
  running: { tier: 'active', tone: 'text-st-running border-st-running/40 bg-st-running/10' },
  paused: { tier: 'solid', tone: 'text-st-stopped border-st-stopped/40 bg-st-stopped/10' },
  done: { tier: 'solid', tone: 'text-st-done border-st-done/35 bg-st-done/10' },
}

export function JobSheetBadge({ status }: { status: JobSheetStatus }) {
  const { tier, tone } = JOB_SHEET_STYLE[status]
  return (
    <Badge tier={tier} tone={tone}>
      {JOB_SHEET_LABEL[status]}
    </Badge>
  )
}

export function WorkOrderBadge({ status }: { status: WorkOrderStatus }) {
  const { tier, tone } = WORK_ORDER_STYLE[status]
  return (
    <Badge tier={tier} tone={tone}>
      {WORK_ORDER_LABEL[status]}
    </Badge>
  )
}

export function RunBadge({ status }: { status: StaffRunStatus }) {
  const { tier, tone } = RUN_STYLE[status]
  return (
    <Badge tier={tier} tone={tone}>
      {RUN_LABEL[status]}
    </Badge>
  )
}

/** A dot that breathes. Only ever on something genuinely in motion. */
function LiveDot() {
  return (
    <span className="relative flex size-1.5 shrink-0" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex size-1.5 rounded-full bg-current" />
    </span>
  )
}

export function Badge({
  tier = 'solid',
  tone,
  children,
}: {
  tier?: Tier
  tone: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-[4px] border px-1.5 py-0.5',
        'text-[12px] leading-none font-medium',
        tone,
      )}
    >
      {tier === 'active' && <LiveDot />}
      {children}
    </span>
  )
}

/* ----------------------------------------------------------- Save state --- */

/**
 * There is no save step: every edit is written to the store as it is made, and
 * stamps the sheet. This reports that fact rather than pretending to be a button.
 */
export function SavedIndicator({ at, className }: { at: string; className?: string }) {
  return (
    <p className={cx('flex items-center gap-1.5 text-[12px] text-text-faint', className)}>
      <CheckCircleIcon size={13} weight="fill" className="text-st-confirmed" aria-hidden />
      All changes saved
      <span className="num">
        {new Date(at).toLocaleTimeString('en-MY', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}
      </span>
    </p>
  )
}

/* ------------------------------------------------------------ Page head --- */

/** Title, one line of orientation, and the page's own actions on the right. */
export function PageHead({
  title,
  blurb,
  children,
}: {
  title: string
  blurb: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-gradient text-[20px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 max-w-[88ch] text-[13px] text-text-dim">{blurb}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/* ------------------------------------------------------------ Data cell --- */

export function Metric({
  label,
  value,
  hint,
  tone,
  dot,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: string
  /** Colour class for the state marker. Only where the label names a real state. */
  dot?: string
}) {
  return (
    <div className="group relative px-3 py-3 transition-colors duration-200">
      <div className="flex items-center gap-1.5">
        {dot && <span className={cx('size-1.5 shrink-0 rounded-full', dot)} aria-hidden />}
        <span className="text-[12px] font-medium tracking-wide text-text-faint uppercase">
          {label}
        </span>
      </div>
      <div className={cx('num mt-1 text-[22px] leading-none font-medium', tone ?? 'text-text')}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[12px] text-text-faint">{hint}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ Tabs --- */

/** Segmented switch. Same chip language as the status filters on the sheet list. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>
  active: T
  onChange: (key: T) => void
}) {
  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px]',
            'transition-colors duration-150',
            active === t.key
              ? 'border-accent bg-accent-soft font-medium text-accent'
              : 'border-line-strong text-text-dim hover:bg-panel-2 hover:text-text',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="num text-text-faint">{t.count}</span>}
        </button>
      ))}
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
      <span className="text-[12px] font-medium text-text-dim">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-text-faint">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-[6px] border border-line-strong bg-panel px-2 py-1.5 text-[13px] text-text ' +
  'placeholder:text-text-faint focus:border-accent focus:outline-none ' +
  'transition-colors duration-150 ' +
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
    <div className="relative flex flex-col items-center justify-center gap-2 overflow-hidden px-6 py-14 text-center">
      {/* Diffused wash instead of a flat grey plate. */}
      <div className="mesh pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative text-accent/70">{icon}</div>
      <p className="relative text-[14px] font-medium text-text">{title}</p>
      <p className="relative max-w-[46ch] text-[13px] text-text-dim">{body}</p>
      {action && <div className="relative mt-2">{action}</div>}
    </div>
  )
}
