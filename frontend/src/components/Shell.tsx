import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  ArrowClockwiseIcon,
  GearSixIcon,
  MoonIcon,
  SunIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { Button, cx } from '@/components/ui'

/* Ordered the way work moves: what is happening, what is planned, what is running. */
const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/job-sheets', label: 'Job sheets' },
  { to: '/confirmed', label: 'Approvals' },
  { to: '/wip', label: 'Work in progress' },
  { to: '/quality', label: 'Quality' },
  { to: '/master-data', label: 'Master data' },
]

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('mes.theme', dark ? 'dark' : 'light')
    } catch {
      /* private mode: theme just does not persist */
    }
  }, [dark])

  return (
    <Button
      variant="ghost"
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      icon={dark ? <SunIcon size={15} weight="bold" /> : <MoonIcon size={15} weight="bold" />}
    />
  )
}

/** Transient confirmation of the last action. Not a decoration, it reports state. */
function Flash() {
  const { flash, clearFlash } = useMes()

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(clearFlash, 5200)
    return () => clearTimeout(t)
  }, [flash, clearFlash])

  if (!flash) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
      <div className="glass animate-pop-in pointer-events-auto flex max-w-[62ch] items-start gap-3 rounded-[6px] border border-line-strong bg-panel/80 px-3 py-2 shadow-lg shadow-black/10">
        <p className="text-[13px] text-text">{flash}</p>
        <button
          onClick={clearFlash}
          className="mt-0.5 text-text-faint hover:text-text"
          aria-label="Dismiss"
        >
          <XIcon size={13} weight="bold" />
        </button>
      </div>
    </div>
  )
}

export function Shell() {
  const { resetDemo } = useMes()

  return (
    <div className="min-h-[100dvh] bg-surface">
      <header className="glass sticky top-0 z-40 border-b border-line bg-panel/70">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-4">
          <div className="flex items-center gap-2">
            <GearSixIcon size={18} weight="fill" className="text-accent" />
            <span className="text-gradient text-[14px] font-semibold tracking-tight">PrePPSE</span>
          </div>

          {/* Eight destinations: the row scrolls rather than wraps on a narrow screen. */}
          <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    'shrink-0 rounded-[6px] px-2.5 py-1.5 text-[13px] transition-colors duration-150',
                    isActive
                      ? 'bg-accent-soft font-medium text-accent'
                      : 'text-text-dim hover:bg-panel-2 hover:text-text',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              onClick={resetDemo}
              icon={<ArrowClockwiseIcon size={15} weight="bold" />}
            >
              Reset data
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5">
        <Outlet />
      </main>

      <Flash />
    </div>
  )
}
