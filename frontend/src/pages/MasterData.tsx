import { useMemo, useState } from 'react'
import { MagnifyingGlassIcon, StackSimpleIcon } from '@phosphor-icons/react'
import { useMes } from '@/store/mes'
import { EmptyState, PageHead, Panel, Tabs, cx, inputClass } from '@/components/ui'
import {
  BOM_LIBRARY,
  MACHINES,
  MATERIAL_MASTER,
  OPERATORS,
  ROUTE_LIBRARY,
  WORK_CENTRES,
} from '@/data/seed'
import { rollupRuns, stockCoverage, yieldOf } from '@/lib/analytics'
import { fmtInt, fmtMoney, fmtQty } from '@/lib/format'

const cell = 'px-2.5 py-2 text-[13px] align-top'
const head = 'px-2.5 py-1.5 text-left text-[12px] font-medium text-text-faint'

type Entity = 'product' | 'material' | 'bom' | 'route' | 'machine' | 'employee' | 'process'

/* ---------------------------------------------------------------- helpers --- */

/** Product family token: FG-BRKT-220 -> BRKT. Joins products to their BOM and route. */
const familyOf = (code: string) => code.split('-')[1] ?? ''

/** operation, work centre, machine, setup minutes, cycle seconds per unit. */
type StepTuple = readonly [string, string, string, number, number]

/*
  Every step in the route library, flattened once. The library is `as const`, so
  each entry's `steps` is its own literal tuple type; widening here keeps the
  machine and work-centre roll-ups below readable.
*/
const ALL_STEPS: StepTuple[] = ROUTE_LIBRARY.flatMap((r) => [...r.steps] as StepTuple[])

export default function MasterData() {
  const { jobSheets, workOrders, staffRuns } = useMes()
  const [tab, setTab] = useState<Entity>('product')
  const [query, setQuery] = useState('')

  /*
    Products are not a table of their own: every product the plant has ever been
    asked to build appears on a job sheet goal, so the master is derived from
    demand and enriched with whichever BOM and route match its family.
  */
  const products = useMemo(() => {
    const byCode = new Map<
      string,
      { code: string; name: string; unit: string; demand: number; sheets: number }
    >()
    for (const sheet of jobSheets) {
      for (const goal of sheet.goals) {
        const row = byCode.get(goal.productCode) ?? {
          code: goal.productCode,
          name: goal.productName,
          unit: goal.unit,
          demand: 0,
          sheets: 0,
        }
        row.demand += goal.targetQty
        row.sheets += 1
        byCode.set(goal.productCode, row)
      }
    }
    return [...byCode.values()]
      .map((p) => {
        const family = familyOf(p.code)
        return {
          ...p,
          family,
          bom: BOM_LIBRARY.find((b) => b.family === family) ?? null,
          route: ROUTE_LIBRARY.find((r) => r.family === family) ?? null,
        }
      })
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [jobSheets])

  const materials = useMemo(() => stockCoverage(workOrders), [workOrders])

  const machines = useMemo(
    () =>
      MACHINES.map((machine) => {
        const booked = workOrders.filter((w) => w.slot?.machine === machine && w.status !== 'completed')
        const runs = staffRuns.filter((r) => r.machine === machine)
        const t = rollupRuns(runs)
        const steps = ALL_STEPS.filter((s) => s[2] === machine)
        return {
          machine,
          code: machine.split(' / ')[0],
          model: machine.split(' / ')[1] ?? '',
          workCentre: steps[0]?.[1] ?? '—',
          booked: booked.length,
          runs: runs.length,
          downtimeMin: t.downtimeMin,
          live: staffRuns.some((r) => r.machine === machine && r.status === 'running'),
        }
      }),
    [workOrders, staffRuns],
  )

  const employees = useMemo(
    () =>
      OPERATORS.map((op) => {
        const runs = staffRuns.filter((r) => r.operatorId === op.id)
        const t = rollupRuns(runs)
        return {
          ...op,
          runs: runs.length,
          shifts: [...new Set(runs.map((r) => r.shift))].sort(),
          done: t.done,
          rosak: t.rosak,
          yieldPct: yieldOf(t),
          live: runs.some((r) => r.status === 'running'),
        }
      }),
    [staffRuns],
  )

  const processes = useMemo(
    () =>
      WORK_CENTRES.map((centre) => {
        const steps = ALL_STEPS.filter((s) => s[1] === centre)
        const machinesHere = [...new Set(steps.map((s) => s[2]))]
        const operations = [...new Set(steps.map((s) => s[0]))]
        const avgCycle = steps.length
          ? Math.round(steps.reduce((sum, s) => sum + s[4], 0) / steps.length)
          : 0
        return { centre, machines: machinesHere, operations, avgCycle }
      }),
    [],
  )

  const q = query.trim().toLowerCase()
  const hit = (...fields: Array<string | number>) =>
    !q || fields.some((f) => String(f).toLowerCase().includes(q))

  const rows = {
    product: products.filter((p) => hit(p.code, p.name, p.family)),
    material: materials.filter((m) => hit(m.code, m.name)),
    bom: BOM_LIBRARY.filter((b) => hit(b.code, b.name, b.family)),
    route: ROUTE_LIBRARY.filter((r) => hit(r.code, r.name, r.family)),
    machine: machines.filter((m) => hit(m.machine, m.workCentre)),
    employee: employees.filter((e) => hit(e.id, e.name)),
    process: processes.filter((p) => hit(p.centre, ...p.operations)),
  }

  const TABS: Array<{ key: Entity; label: string; count: number }> = [
    { key: 'product', label: 'Products', count: rows.product.length },
    { key: 'material', label: 'Materials', count: rows.material.length },
    { key: 'bom', label: 'BOM', count: rows.bom.length },
    { key: 'route', label: 'Routes', count: rows.route.length },
    { key: 'machine', label: 'Machines', count: rows.machine.length },
    { key: 'employee', label: 'Employees', count: rows.employee.length },
    { key: 'process', label: 'Processes', count: rows.process.length },
  ]

  const empty = rows[tab].length === 0

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Master data"
        blurb="The records planning draws on: what the plant makes, what it makes it from, the BOMs and routes it follows, and the machines, people and work centres that do the work."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-[300px]">
          <MagnifyingGlassIcon
            size={14}
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this table"
            className={cx(inputClass, 'pl-8')}
            aria-label="Search master data"
          />
        </div>
      </div>

      <Panel className="overflow-hidden">
        {empty ? (
          <EmptyState
            icon={<StackSimpleIcon size={30} weight="light" />}
            title="Nothing matches"
            body="Clear the search to see every record in this table."
          />
        ) : (
          <div className="overflow-x-auto">
            {tab === 'product' && (
              <table className="w-full min-w-[860px]">
                <Head
                  cols={['Product', 'Family', 'Standard BOM', 'Standard route', 'Open demand', 'Sheets']}
                  right={[4, 5]}
                />
                <tbody className="divide-y divide-line">
                  {rows.product.map((p) => (
                    <tr key={p.code} className="hover:bg-panel-2">
                      <td className={cell}>
                        <div className="num font-medium">{p.code}</div>
                        <div className="mt-0.5 text-[12px] text-text-faint">{p.name}</div>
                      </td>
                      <td className={cx(cell, 'num text-text-dim')}>{p.family}</td>
                      <td className={cell}>
                        {p.bom ? (
                          <>
                            <div className="num text-[12px]">{p.bom.code}</div>
                            <div className="text-[12px] text-text-faint">{p.bom.lines.length} lines</div>
                          </>
                        ) : (
                          <Missing />
                        )}
                      </td>
                      <td className={cell}>
                        {p.route ? (
                          <>
                            <div className="num text-[12px]">{p.route.code}</div>
                            <div className="text-[12px] text-text-faint">{p.route.steps.length} steps</div>
                          </>
                        ) : (
                          <Missing />
                        )}
                      </td>
                      <td className={cx(cell, 'num text-right')}>
                        {fmtInt(p.demand)} <span className="text-text-faint">{p.unit}</span>
                      </td>
                      <td className={cx(cell, 'num text-right text-text-dim')}>{p.sheets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'material' && (
              <table className="w-full min-w-[900px]">
                <Head
                  cols={['Material', 'Unit', 'On hand', 'Required by plan', 'Cover', 'Unit cost']}
                  right={[2, 3, 4, 5]}
                />
                <tbody className="divide-y divide-line">
                  {rows.material.map((m) => {
                    const short = m.shortfallQty > 0
                    return (
                      <tr key={m.code} className="hover:bg-panel-2">
                        <td className={cell}>
                          <div className="num font-medium">{m.code}</div>
                          <div className="mt-0.5 text-[12px] text-text-faint">{m.name}</div>
                        </td>
                        <td className={cx(cell, 'text-text-dim')}>{m.unit}</td>
                        <td className={cx(cell, 'num text-right')}>{fmtQty(m.onHandQty)}</td>
                        <td className={cx(cell, 'num text-right text-text-dim')}>
                          {m.requiredQty ? fmtQty(m.requiredQty) : '—'}
                        </td>
                        <td className={cx(cell, 'num text-right', short && 'text-st-stopped')}>
                          {m.coverPct === null ? (
                            <span className="text-text-faint">—</span>
                          ) : short ? (
                            `short ${fmtQty(m.shortfallQty)}`
                          ) : (
                            `${m.coverPct}%`
                          )}
                        </td>
                        <td className={cx(cell, 'num text-right')}>{fmtMoney(m.unitCost)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {tab === 'bom' && (
              <table className="w-full min-w-[820px]">
                <Head cols={['BOM', 'Family', 'Lines', 'Cost per unit']} right={[3]} />
                <tbody className="divide-y divide-line">
                  {rows.bom.map((b) => {
                    const perUnit = b.lines.reduce((sum, [code, per]) => {
                      const material = MATERIAL_MASTER.find((m) => m.code === code)
                      return sum + per * (material?.unitCost ?? 0)
                    }, 0)
                    return (
                      <tr key={b.id} className="hover:bg-panel-2">
                        <td className={cell}>
                          <div className="num font-medium">{b.code}</div>
                          <div className="mt-0.5 text-[12px] text-text-faint">{b.name}</div>
                        </td>
                        <td className={cx(cell, 'num text-text-dim')}>{b.family}</td>
                        <td className={cell}>
                          <ul className="flex flex-col gap-0.5">
                            {b.lines.map(([code, per]) => {
                              const material = MATERIAL_MASTER.find((m) => m.code === code)
                              return (
                                <li key={code} className="num text-[12px] text-text-dim">
                                  {code} · {per} {material?.unit ?? ''} per unit
                                </li>
                              )
                            })}
                          </ul>
                        </td>
                        <td className={cx(cell, 'num text-right')}>{fmtMoney(perUnit)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {tab === 'route' && (
              <table className="w-full min-w-[900px]">
                <Head cols={['Route', 'Family', 'Steps', 'Setup', 'Cycle']} right={[3, 4]} />
                <tbody className="divide-y divide-line">
                  {rows.route.map((r) => {
                    const setup = r.steps.reduce((sum, s) => sum + s[3], 0)
                    const cycle = r.steps.reduce((sum, s) => sum + s[4], 0)
                    return (
                      <tr key={r.id} className="hover:bg-panel-2">
                        <td className={cell}>
                          <div className="num font-medium">{r.code}</div>
                          <div className="mt-0.5 text-[12px] text-text-faint">{r.name}</div>
                        </td>
                        <td className={cx(cell, 'num text-text-dim')}>{r.family}</td>
                        <td className={cell}>
                          <ol className="flex flex-col gap-0.5">
                            {r.steps.map(([operation, centre, machine], i) => (
                              <li key={`${operation}-${i}`} className="text-[12px] text-text-dim">
                                <span className="num text-text-faint">{i + 1}.</span> {operation}
                                <span className="num text-text-faint"> · {centre} · {machine}</span>
                              </li>
                            ))}
                          </ol>
                        </td>
                        <td className={cx(cell, 'num text-right')}>{setup} min</td>
                        <td className={cx(cell, 'num text-right')}>{cycle} s/unit</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {tab === 'machine' && (
              <table className="w-full min-w-[860px]">
                <Head
                  cols={['Machine', 'Work centre', 'State', 'Booked orders', 'Runs recorded', 'Downtime']}
                  right={[3, 4, 5]}
                />
                <tbody className="divide-y divide-line">
                  {rows.machine.map((m) => (
                    <tr key={m.machine} className="hover:bg-panel-2">
                      <td className={cell}>
                        <div className="num font-medium">{m.code}</div>
                        <div className="mt-0.5 text-[12px] text-text-faint">{m.model}</div>
                      </td>
                      <td className={cx(cell, 'text-text-dim')}>{m.workCentre}</td>
                      <td className={cell}>
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 text-[12px]',
                            m.live ? 'text-st-running' : 'text-text-faint',
                          )}
                        >
                          <span
                            className={cx(
                              'size-1.5 rounded-full',
                              m.live ? 'bg-st-running' : 'bg-line-strong',
                            )}
                            aria-hidden
                          />
                          {m.live ? 'Running' : 'Idle'}
                        </span>
                      </td>
                      <td className={cx(cell, 'num text-right text-text-dim')}>{m.booked}</td>
                      <td className={cx(cell, 'num text-right text-text-dim')}>{m.runs}</td>
                      <td
                        className={cx(cell, 'num text-right', m.downtimeMin ? 'text-st-stopped' : 'text-text-dim')}
                      >
                        {fmtInt(m.downtimeMin)} min
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'employee' && (
              <table className="w-full min-w-[820px]">
                <Head
                  cols={['Operator', 'Shifts', 'State', 'Runs', 'Good', 'Rosak', 'Yield']}
                  right={[3, 4, 5, 6]}
                />
                <tbody className="divide-y divide-line">
                  {rows.employee.map((e) => (
                    <tr key={e.id} className="hover:bg-panel-2">
                      <td className={cell}>
                        <div className="font-medium">{e.name}</div>
                        <div className="num mt-0.5 text-[12px] text-text-faint">{e.id}</div>
                      </td>
                      <td className={cx(cell, 'num text-text-dim')}>
                        {e.shifts.length ? e.shifts.join(', ') : '—'}
                      </td>
                      <td className={cell}>
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 text-[12px]',
                            e.live ? 'text-st-running' : 'text-text-faint',
                          )}
                        >
                          <span
                            className={cx(
                              'size-1.5 rounded-full',
                              e.live ? 'bg-st-running' : 'bg-line-strong',
                            )}
                            aria-hidden
                          />
                          {e.live ? 'Clocked in' : 'Off shift'}
                        </span>
                      </td>
                      <td className={cx(cell, 'num text-right text-text-dim')}>{e.runs}</td>
                      <td className={cx(cell, 'num text-right text-st-done')}>{fmtInt(e.done)}</td>
                      <td
                        className={cx(cell, 'num text-right', e.rosak ? 'text-st-stopped' : 'text-text-dim')}
                      >
                        {fmtInt(e.rosak)}
                      </td>
                      <td className={cx(cell, 'num text-right')}>
                        {e.yieldPct ? `${e.yieldPct}%` : <span className="text-text-faint">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'process' && (
              <table className="w-full min-w-[820px]">
                <Head cols={['Work centre', 'Operations', 'Machines', 'Average cycle']} right={[3]} />
                <tbody className="divide-y divide-line">
                  {rows.process.map((p) => (
                    <tr key={p.centre} className="hover:bg-panel-2">
                      <td className={cx(cell, 'font-medium')}>{p.centre}</td>
                      <td className={cx(cell, 'text-text-dim')}>
                        {p.operations.length ? p.operations.join(', ') : <Missing />}
                      </td>
                      <td className={cell}>
                        <ul className="flex flex-col gap-0.5">
                          {p.machines.map((m) => (
                            <li key={m} className="num text-[12px] text-text-dim">
                              {m}
                            </li>
                          ))}
                          {p.machines.length === 0 && <Missing />}
                        </ul>
                      </td>
                      <td className={cx(cell, 'num text-right')}>
                        {p.avgCycle ? `${p.avgCycle} s/unit` : <span className="text-text-faint">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Panel>

      <p className="text-[12px] text-text-faint">
        Master data is read-only in this build: the tables above are the seeded records the planner
        and the auto-assign matcher work against. Creating and editing records lands with the backend.
      </p>
    </div>
  )
}

/** `right` names the numeric columns, which are the only ones that right-align. */
function Head({ cols, right = [] }: { cols: string[]; right?: number[] }) {
  return (
    <thead className="border-b border-line bg-panel-2/60">
      <tr>
        {cols.map((c, i) => (
          <th key={c} className={cx(head, right.includes(i) && 'text-right')}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function Missing() {
  return <span className="text-[12px] text-st-stopped">not defined</span>
}
