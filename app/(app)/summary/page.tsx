'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts'
import {
  ChartTooltip, CHART_GRID, CHART_AXIS, CHART_CURSOR, CHART_POSITIVE, CHART_NEGATIVE, BAR_RADIUS,
} from '@/components/chartTheme'
import { FolderKanban, DollarSign, TrendingDown, BarChart2, CalendarRange, X, ChevronRight, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import Modal from '@/components/Modal'
import MultiSelect from '@/components/MultiSelect'
import KpiCard from '@/components/KpiCard'
import { buildFacets, type FacetDef } from '@/lib/facets'

interface SummaryProject {
  id: string
  name: string
  project_manager: string | null
  status: string
  billing_type: string
  contract_value: number
  start_date: string | null
  end_date: string | null
  master_project?: { region: string | null; team: string | null; project_code: string | null } | null
  // filled from the cost RPC
  manpower_cost: number
  expense_cost: number
  vendor_cost: number
  hours: number
}

interface CostRow { project_id: string; manpower_cost: number; hours: number; expense_cost: number; vendor_cost: number }
interface PersonRow { project_id: string; consultant_name: string; hours: number; cost: number }
interface VendorRow { id: number; project_id: string; vendor_name: string; amount_sgd: number; cost_date: string | null; description: string | null }

const DEFAULT_SGA_RATE_PCT = 30
const fmt = (v: number) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(v)
const BAR_CAP = 15

const FACETS: FacetDef<SummaryProject>[] = [
  { key: 'team', label: 'All teams', get: p => p.master_project?.team },
  { key: 'region', label: 'All regions', get: p => p.master_project?.region },
  { key: 'pm', label: 'All PMs', get: p => p.project_manager },
]

const teamOf = (p: SummaryProject) => p.master_project?.team?.trim() || 'Unassigned'
const customerOf = (p: SummaryProject) => p.master_project?.project_code?.trim() || 'Unassigned'

// ── Team > Customer > Project drill-down bar chart ───────────────────────────

const LEVELS = ['Team', 'Customer', 'Project'] as const

function HierarchyChart({ title, projects, metric, onOpenProject }: {
  title: string
  projects: SummaryProject[]
  metric: (p: SummaryProject) => number
  onOpenProject: (p: SummaryProject) => void
}) {
  const [path, setPath] = useState<string[]>([]) // [team] or [team, customer]
  const level = path.length

  const scoped = useMemo(() => projects.filter(p =>
    (level < 1 || teamOf(p) === path[0]) && (level < 2 || customerOf(p) === path[1])),
    [projects, path, level])

  const groups = useMemo(() => {
    const keyFn = level === 0 ? teamOf : level === 1 ? customerOf : (p: SummaryProject) => p.name
    const map = new Map<string, { name: string; value: number; count: number }>()
    for (const p of scoped) {
      const key = keyFn(p)
      const g = map.get(key) ?? { name: key, value: 0, count: 0 }
      g.value += metric(p)
      g.count += 1
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => b.value - a.value)
  }, [scoped, level, metric])

  const shown = groups.slice(0, BAR_CAP)
  const hasNegative = shown.some(g => g.value < 0)

  function handleClick(name: string | undefined) {
    if (!name) return
    if (level < 2) { setPath([...path, name]); return }
    const project = scoped.find(p => p.name === name)
    if (project) onOpenProject(project)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-1 gap-4">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {level < 2 ? `Click a bar to drill into ${LEVELS[level + 1].toLowerCase()}s` : 'Click a bar to open the project dashboard'}
        </span>
      </div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-4 text-xs flex-wrap">
        <button onClick={() => setPath([])}
          className={path.length === 0 ? 'font-semibold text-slate-700' : 'text-teal-600 hover:underline'}>
          All Teams
        </button>
        {path.map((seg, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            <ChevronRight size={11} className="text-slate-300 flex-shrink-0" />
            <button onClick={() => setPath(path.slice(0, i + 1))}
              className={`truncate max-w-[260px] ${i === path.length - 1 ? 'font-semibold text-slate-700' : 'text-teal-600 hover:underline'}`}
              title={seg}>
              {seg}
            </button>
          </span>
        ))}
        <span className="text-slate-400 ml-1">· {LEVELS[level]} level · {groups.length > BAR_CAP ? `top ${BAR_CAP} of ${groups.length}` : `${groups.length} ${LEVELS[level].toLowerCase()}${groups.length === 1 ? '' : 's'}`}</span>
      </div>
      {shown.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No data for the current filters</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={shown} margin={{ top: 4, right: 8, bottom: 70, left: 8 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...CHART_AXIS} dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }}
              angle={-40} textAnchor="end" interval={0} height={85}
              tickFormatter={(v: string) => v.length > 24 ? v.slice(0, 23) + '…' : v} />
            <YAxis {...CHART_AXIS} tickFormatter={(v: number) => `S$${(v / 1000).toFixed(0)}k`} />
            <ReTooltip
              cursor={CHART_CURSOR}
              content={<ChartTooltip format={fmt} sub={r => `${r.count ?? 0} project(s)`} />}
            />
            {hasNegative && <ReferenceLine y={0} stroke="#cbd5e1" />}
            <Bar dataKey="value" radius={BAR_RADIUS} maxBarSize={52} cursor="pointer"
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              onClick={(d: any) => handleClick(d?.name ?? d?.payload?.name)}>
              {shown.map(g => <Cell key={g.name} fill={g.value < 0 ? CHART_NEGATIVE : CHART_POSITIVE} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SummaryPage() {
  const router = useRouter()
  const { setSelectedProject } = useProject()
  const [projects, setProjects] = useState<SummaryProject[]>([])
  const [personRows, setPersonRows] = useState<PersonRow[]>([])
  const [vendorRows, setVendorRows] = useState<VendorRow[]>([])
  const [sgaRatePct, setSgaRatePct] = useState(DEFAULT_SGA_RATE_PCT)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [facetSel, setFacetSel] = useState<Record<string, string[]>>(
    () => Object.fromEntries(FACETS.map(f => [f.key, [] as string[]])))
  const [vendorDrill, setVendorDrill] = useState<{ product: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    const sb = createClient()
    async function load() {
      const [proj, costs, people, vendors, sett] = await Promise.all([
        sb.from('projects')
          .select('id, name, project_manager, status, billing_type, contract_value, start_date, end_date, master_project(region, team, project_code)')
          .neq('status', 'archived'),
        sb.rpc('project_cost_summary', { date_from: dateFrom || null, date_to: dateTo || null }),
        sb.rpc('person_cost_summary', { date_from: dateFrom || null, date_to: dateTo || null }),
        sb.from('vendor_costs').select('id, project_id, vendor_name, amount_sgd, cost_date, description'),
        sb.from('user_settings').select('key, value').eq('key', 'overhead_rate_pct'),
      ])
      const costMap = new Map(((costs.data ?? []) as CostRow[]).map(c => [c.project_id, c]))
      const rows = ((proj.data ?? []) as unknown as Omit<SummaryProject, 'manpower_cost' | 'expense_cost' | 'vendor_cost' | 'hours'>[])
        .map(p => {
          const c = costMap.get(p.id)
          return {
            ...p,
            manpower_cost: Number(c?.manpower_cost ?? 0),
            expense_cost: Number(c?.expense_cost ?? 0),
            vendor_cost: Number(c?.vendor_cost ?? 0),
            hours: Number(c?.hours ?? 0),
          }
        })
      setProjects(rows)
      setPersonRows(((people.data ?? []) as PersonRow[]).map(r => ({ ...r, hours: Number(r.hours), cost: Number(r.cost) })))
      setVendorRows((vendors.data ?? []) as VendorRow[])
      const rate = parseFloat((sett.data?.[0] as { value?: string } | undefined)?.value ?? '')
      if (!isNaN(rate)) setSgaRatePct(rate)
    }
    load().finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  const facets = useMemo(() =>
    buildFacets(projects, FACETS, facetSel, '', p => [p.name]),
    [projects, facetSel])
  const filtered = facets.filtered
  const filteredIds = useMemo(() => new Set(filtered.map(p => p.id)), [filtered])
  const hasFilter = Object.values(facetSel).some(v => v.length) || !!dateFrom || !!dateTo

  // Net profit per project follows the dashboard formula:
  // GP = Revenue − SG&A; NP = GP − (Manpower + Expenses + Vendor)
  const netProfitOf = useMemo(() => (p: SummaryProject) => {
    const revenue = p.contract_value || 0
    return revenue - revenue * (sgaRatePct / 100) - (p.manpower_cost + p.expense_cost + p.vendor_cost)
  }, [sgaRatePct])

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, p) => s + (p.contract_value || 0), 0)
    const manpower = filtered.reduce((s, p) => s + p.manpower_cost, 0)
    const expenses = filtered.reduce((s, p) => s + p.expense_cost, 0)
    const vendor = filtered.reduce((s, p) => s + p.vendor_cost, 0)
    const totalCost = manpower + expenses + vendor
    const sga = revenue * (sgaRatePct / 100)
    const grossProfit = revenue - sga
    const netProfit = grossProfit - totalCost
    const teamCounts = new Map<string, number>()
    for (const p of filtered) teamCounts.set(teamOf(p), (teamCounts.get(teamOf(p)) ?? 0) + 1)
    return { revenue, manpower, expenses, vendor, totalCost, sga, grossProfit, netProfit, teamCounts }
  }, [filtered, sgaRatePct])

  // Manpower cost per person across the filtered projects
  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; cost: number; hours: number; projects: Set<string> }>()
    for (const r of personRows) {
      if (!filteredIds.has(r.project_id)) continue
      const g = map.get(r.consultant_name) ?? { name: r.consultant_name, cost: 0, hours: 0, projects: new Set<string>() }
      g.cost += r.cost
      g.hours += r.hours
      g.projects.add(r.project_id)
      map.set(r.consultant_name, g)
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours)
  }, [personRows, filteredIds])
  const personShown = byPerson.slice(0, BAR_CAP)

  // 3rd party vendor cost per product across the filtered projects, honouring
  // the cost date range (vendor rows are dated by their Year of Signoff)
  const inRange = (d: string | null) => {
    if (!dateFrom && !dateTo) return true
    if (!d) return false
    return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)
  }
  const filteredVendorRows = useMemo(
    () => vendorRows.filter(r => filteredIds.has(r.project_id) && inRange(r.cost_date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendorRows, filteredIds, dateFrom, dateTo])
  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; value: number; count: number }>()
    for (const r of filteredVendorRows) {
      const g = map.get(r.vendor_name) ?? { name: r.vendor_name, value: 0, count: 0 }
      g.value += Number(r.amount_sgd ?? 0)
      g.count += 1
      map.set(r.vendor_name, g)
    }
    return [...map.values()].sort((a, b) => b.value - a.value)
  }, [filteredVendorRows])
  const vendorTotal = byProduct.reduce((s, g) => s + g.value, 0)
  const projectNameById = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects])
  const vendorDrillRows = useMemo(() =>
    vendorDrill
      ? filteredVendorRows.filter(r => r.vendor_name === vendorDrill.product)
          .sort((a, b) => Number(b.amount_sgd) - Number(a.amount_sgd))
      : [],
    [vendorDrill, filteredVendorRows])

  function handleOpenProject(p: SummaryProject) {
    setSelectedProject(p.id)
    router.push('/dashboard')
  }

  const dateInputCls = 'border border-slate-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700'
  const rangeLabel = (dateFrom || dateTo) ? `${dateFrom || 'start'} → ${dateTo || 'today'}` : 'all time'
  const filterInfo = [
    facetSel.team?.length ? `Team: ${facetSel.team.join(', ')}` : null,
    facetSel.region?.length ? `Region: ${facetSel.region.join(', ')}` : null,
    facetSel.pm?.length ? `PM: ${facetSel.pm.join(', ')}` : null,
    `Costs: ${rangeLabel}`,
  ].filter(Boolean).join(' · ')

  if (loading && projects.length === 0) return (
    <div className="flex items-center justify-center h-full py-24">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Summary Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">All projects at a glance — drill from team to customer to project</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {FACETS.map(f => (
          <MultiSelect key={f.key} label={f.label} options={facets.options[f.key]} selected={facetSel[f.key]}
            onChange={values => setFacetSel(s => ({ ...s, [f.key]: values }))} />
        ))}
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide ml-1">
          <CalendarRange size={14} className="text-slate-400" /> Costs
        </span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={dateInputCls} aria-label="From date" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={dateInputCls} aria-label="To date" />
        {hasFilter && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setFacetSel(Object.fromEntries(FACETS.map(f => [f.key, []]))) }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-2"
          >
            <X size={12} /> Reset
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} / {projects.length} projects</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Projects', value: String(filtered.length), icon: FolderKanban, tint: 'bg-slate-100 text-slate-600', sub: [...totals.teamCounts.entries()].map(([t, n]) => `${n} ${t}`).join(' · ') },
          { label: 'Total Billing Value', value: fmt(totals.revenue), icon: DollarSign, tint: 'bg-teal-50 text-teal-600', sub: 'Sum of project billing values' },
          { label: 'Total Cost', value: fmt(totals.totalCost), icon: TrendingDown, tint: 'bg-amber-50 text-amber-600', sub: `Manpower ${fmt(totals.manpower)} · Expenses ${fmt(totals.expenses)} · 3rd Party ${fmt(totals.vendor)}` },
          { label: 'Net Profit', value: fmt(totals.netProfit), icon: BarChart2, tint: 'bg-teal-50 text-teal-600', sub: `GP ${fmt(totals.grossProfit)} (after ${sgaRatePct}% SG&A) − cost`, valueClass: totals.netProfit >= 0 ? 'text-teal-700' : 'text-red-500' },
        ].map(({ label, value, icon, tint, sub, valueClass }) => (
          <KpiCard key={label} label={label} value={value} sub={sub} icon={icon} tint={tint} valueClass={valueClass} />
        ))}
      </div>

      {/* Team > Customer > Project drill-down charts */}
      <HierarchyChart title="Net Profit" projects={filtered} metric={netProfitOf} onOpenProject={handleOpenProject} />
      <HierarchyChart title="Manpower Cost" projects={filtered} metric={p => p.manpower_cost} onOpenProject={handleOpenProject} />

      {/* Manpower cost by person across all filtered projects */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4 gap-4">
          <h3 className="text-sm font-semibold text-slate-700">Hours by Person</h3>
          <span className="text-xs text-slate-400 truncate" title={filterInfo}>
            {byPerson.length > BAR_CAP ? `Top ${BAR_CAP} of ${byPerson.length} people · ` : `${byPerson.length} people · `}{filterInfo}
          </span>
        </div>
        {personShown.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">No timesheet data for the current filters</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={personShown} margin={{ top: 4, right: 8, bottom: 70, left: 8 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis {...CHART_AXIS} dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} angle={-40} textAnchor="end" interval={0} height={85} />
              <YAxis {...CHART_AXIS} tickFormatter={(v: number) => `${v.toLocaleString()} h`} />
              <ReTooltip
                cursor={CHART_CURSOR}
                content={<ChartTooltip
                  format={v => `${v.toFixed(1)} h`}
                  sub={r => `${(r.projects as Set<string> | undefined)?.size ?? 0} project(s)`}
                />}
              />
              <Bar dataKey="hours" fill={CHART_POSITIVE} radius={BAR_RADIUS} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 3rd party vendor cost, filtered */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-1 gap-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Building2 size={14} className="text-slate-400" /> 3rd Party Cost by Product</h3>
          <span className="text-xs text-slate-400">Click a product for the projects behind it</span>
        </div>
        <p className="text-xs text-slate-400 mb-4 truncate" title={filterInfo}>
          Total {fmt(vendorTotal)} across {filteredVendorRows.length} contract{filteredVendorRows.length === 1 ? '' : 's'} · {filterInfo}
        </p>
        {byProduct.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No 3rd party vendor costs for the current filters</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {byProduct.map(g => (
              <button key={g.name} onClick={() => setVendorDrill({ product: g.name })}
                className="flex items-center justify-between gap-2 bg-slate-50 hover:bg-teal-50 border border-slate-100 hover:border-teal-200 rounded-lg px-3 py-2.5 text-left transition-colors">
                <span className="min-w-0">
                  <span className="block text-sm text-slate-700 font-medium truncate" title={g.name}>{g.name}</span>
                  <span className="block text-xs text-slate-400">{g.count} contract{g.count === 1 ? '' : 's'}</span>
                </span>
                <span className="font-mono text-sm font-semibold text-slate-800 whitespace-nowrap">{fmt(g.value)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vendor product drill-down */}
      <Modal open={!!vendorDrill} title={vendorDrill ? `3rd Party Cost — ${vendorDrill.product}` : ''} onClose={() => setVendorDrill(null)} maxWidth="max-w-2xl">
        {vendorDrill && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{filterInfo}</p>
            <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-3 py-2 font-medium">Project</th>
                    <th className="text-left px-3 py-2 font-medium">Year</th>
                    <th className="text-right px-3 py-2 font-medium">3rd Party Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendorDrillRows.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-slate-700">{projectNameById.get(r.project_id) ?? r.project_id}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.cost_date?.slice(0, 4) ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{fmt(Number(r.amount_sgd))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr className="font-semibold text-slate-800">
                    <td className="px-3 py-2" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(vendorDrillRows.reduce((s, r) => s + Number(r.amount_sgd), 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
