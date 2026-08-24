export const fmtInt = (n: number) => n.toLocaleString('en-MY')

export const fmtQty = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('en-MY') : n.toLocaleString('en-MY', { maximumFractionDigits: 2 })

export const fmtMoney = (n: number) =>
  n.toLocaleString('en-MY', { style: 'currency', currency: 'MYR', maximumFractionDigits: 2 })

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Elapsed span in h:mm, open-ended when the run has not finished. */
export function fmtSpan(startIso: string, endIso: string | null) {
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const mins = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 60000))
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

export const daysUntil = (dateStr: string) =>
  Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
