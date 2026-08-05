'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { FolderKanban, DollarSign, TrendingDown, BarChart2, CalendarRange, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import Modal from '@/components/Modal'
import MultiSelect from '@/components/MultiSelect'
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
  master_project?: { region: string | null; team: string | null } | null
  // filled from the cost RPC
  manpower_cost: number
  expense_cost: number
  vendor_cost: number
  hours: number
}

interface CostRow { project_id: string; manpower_cost: number; hours: number; expense_cost: number; vendor_cost: number }

const DEFAULT_SGA_RATE_PCT = 30
const fmt = (v: number) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(v)
const CHART_COLORS = ['#0d9488', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4']

const FACETS: FacetDef<SummaryProject>[] = [
  { key: 'team', label: 'All teams', get: p => p.master_project?.team },
  { key: 'region', label: 'All regions', get: p => p.master_project?.region },
  { key: 'pm', label: 'All PMs', get: p => p.project_manager },
]

type Group = { name: string; value: number; cost: number; count: number; projects: SummaryProject[] }

function groupBy(projects: SummaryProject[], get: (p: SummaryProject) => string | null | undefined): Group[] {
  const map = new Map<string, Group>()
  for (const p of projects) {
    const key = get(p) || 'Unassigned'
    let g = map.get(key)
    if (!g) { g = { name: key, value: 0, cost: 0, count: 0, projects: [] }; map.set(key, g) }
    g.value += p.contract_value || 0
    g.cost += p.manpower_cost + p.expense_cost + p.vendor_cost
    g.count += 1
    g.projects.push(p)
  }
  return [...map.values()].sort((a, b) => b.value - a.value)
}

export default function SummaryPage() {
  const router = useRouter()
  const { setSelectedProject } = useProject()
  const [projects, setProjects] = useState<SummaryProject[]>([])
  const [sgaRatePct, setSgaRatePct] = useState(DEFAULT_SGA_RATE_PCT)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [facetSel, setFacetSel] = useState<Record<string, string[]>>(
    () => Object.fromEntries(FACETS.map(f => [f.key, [] as string[]])))
  const [drill, setDrill] = useState<{ title: string; group: Group } | null>(null)

  useEffect(() => {
    setLoading(true)
    const sb = createClient()
    async function load() {
      const [proj, costs, sett] = await Promise.all([
        sb.from('projects')
          .select('id, name, project_manager, status, billing_type, contract_value, start_date, end_date, master_project(region, team)')
          .neq('status', 'archived'),
        sb.rpc('project_cost_summary', { date_from: dateFrom || null, date_to: dateTo || null }),
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
      const rate = parseFloat((sett.data?.[0] as { value?: string } | undefined)?.value ?? '')
      if (!isNaN(rate)) setSgaRatePct(rate)
    }
    load().finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  const facets = useMemo(() =>
    buildFacets(projects, FACETS, facetSel, '', p => [p.name]),
    [projects, facetSel])
  const filtered = facets.filtered
  const hasFilter = Object.values(facetSel).some(v => v.length) || !!dateFrom || !!dateTo

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, p) => s + (p.contract_value || 0), 0)
    const manpower = filtered.reduce((s, p) => s + p.manpower_cost, 0)
    const expenses = filtered.reduce((s, p) => s + p.expense_cost, 0)
    const vendor = filtered.reduce((s, p) => s + p.vendor_cost, 0)
    const totalCost = manpower + expenses + vendor
    const sga = revenue * (sgaRatePct / 100)
    const grossProfit = revenue - sga
    const netProfit = grossProfit - totalCost
    return { revenue, manpower, expenses, vendor, totalCost, sga, grossProfit, netProfit }
  }, [filtered, sgaRatePct])

  const byTeam = useMemo(() => groupBy(filtered, p => p.master_project?.team), [filtered])
  const byRegion = useMemo(() => groupBy(filtered, p => p.master_project?.region), [filtered])
  const byPm = useMemo(() => groupBy(filtered, p => p.project_manager).slice(0, 12), [filtered])

  const openGroup = (title: string) => (g: Group | undefined) => { if (g) setDrill({ title: `${title}: ${g.name}`, group: g }) }
  const openTeam = openGroup('Team')
  const openRegion = openGroup('Region')
  const openPm = openGroup('PM')

  function handleOpenProject(p: SummaryProject) {
    setSelectedProject(p.id)
    router.push('/dashboard')
  }

  const dateInputCls = 'border border-slate-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700'

  if (loading && projects.length === 0) return (
    <div className="flex items-center justify-center h-full py-24">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Summary Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">All projects at a glance — click any chart segment for the projects behind it</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
        {FACETS.map(f => (
          <MultiSelect key={f.key} label={f.label} options={facets.options[f.key]} selected={facetSel[f.key]}
            onChange={values => setFacetSel(s => ({ ...s, [f.key]: values }))} />
        ))}
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide ml-2">
          <CalendarRange size={14} className="text-slate-400" /> Costs
        </span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={dateInputCls} aria-label="From date" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={dateInputCls} aria-label="To date" />
        {hasFilter && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setFacetSel(Object.fromEntries(FACETS.map(f => [f.key, []]))) }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 border border-slate-200 rounded-lg px-2 py-1.5 transition-colors"
          >
            <X size={12} /> Reset
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} / {projects.length} projects</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Projects', value: String(filtered.length), icon: FolderKanban, sub: `${byTeam.map(t => `${t.count} ${t.name}`).join(' · ')}` },
          { label: 'Total Billing Value', value: fmt(totals.revenue), icon: DollarSign, sub: 'Sum of project billing values' },
          { label: 'Total Cost', value: fmt(totals.totalCost), icon: TrendingDown, sub: `Manpower ${fmt(totals.manpower)} · Expenses ${fmt(totals.expenses)} · Vendor ${fmt(totals.vendor)}` },
          { label: 'Net Profit', value: fmt(totals.netProfit), icon: BarChart2, sub: `GP ${fmt(totals.grossProfit)} (after ${sgaRatePct}% SG&A) − cost`, valueClass: totals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500' },
        ].map(({ label, value, icon: Icon, sub, valueClass }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
              <Icon size={16} className="text-slate-400" />
            </div>
            <p className={`text-2xl font-bold text-slate-800 ${valueClass ?? ''}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1 truncate" title={sub}>{sub}</p>}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[{ title: 'Billing Value by Team', data: byTeam, open: openTeam },
          { title: 'Billing Value by Region', data: byRegion, open: openRegion }].map(({ title, data, open }) => (
          <div key={title} className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
              <span className="text-xs text-slate-400">Click a segment for details</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data} cx="50%" cy="45%" innerRadius={70} outerRadius={100}
                  paddingAngle={3} dataKey="value" nameKey="name" labelLine={false}
                  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                  onClick={(d: any) => open(data.find(g => g.name === (d?.name ?? d?.payload?.name)))}
                  cursor="pointer"
                >
                  {data.map((d, i) => <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <ReTooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
              {data.map((g, i) => (
                <button key={g.name} onClick={() => open(g)}
                  className="flex items-center gap-1.5 text-left hover:bg-slate-50 rounded px-1 py-0.5 transition-colors">
                  <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span>{g.name}: <span className="font-medium text-slate-800">{fmt(g.value)}</span> ({g.count})</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Billing Value by Project Manager</h3>
          <span className="text-xs text-slate-400">Top {byPm.length} · click a bar for details</span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={byPm} margin={{ top: 4, right: 8, bottom: 70, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={80} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `S$${(v / 1000).toFixed(0)}k`} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <ReTooltip formatter={(v: any) => fmt(Number(v))} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} cursor="pointer"
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              onClick={(d: any) => openPm(byPm.find(g => g.name === (d?.name ?? d?.payload?.name)))} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Group drill-down */}
      <Modal open={!!drill} title={drill?.title ?? ''} onClose={() => setDrill(null)} maxWidth="max-w-3xl">
        {drill && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-500">Projects</p>
                <p className="text-sm font-bold text-slate-800">{drill.group.count}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-500">Billing Value</p>
                <p className="text-sm font-bold text-slate-800">{fmt(drill.group.value)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-500">Cost{(dateFrom || dateTo) ? ' (in range)' : ''}</p>
                <p className="text-sm font-bold text-slate-800">{fmt(drill.group.cost)}</p>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-3 py-2 font-medium">Project</th>
                    <th className="text-left px-3 py-2 font-medium">PM</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium">Billing Value</th>
                    <th className="text-right px-3 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...drill.group.projects].sort((a, b) => (b.contract_value || 0) - (a.contract_value || 0)).map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2">
                        <button onClick={() => handleOpenProject(p)}
                          className="text-left text-teal-700 hover:underline font-medium" title="Open in Dashboard">
                          {p.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{p.project_manager || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs capitalize">{p.status}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{p.contract_value > 0 ? fmt(p.contract_value) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(p.manpower_cost + p.expense_cost + p.vendor_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">Click a project name to open its full dashboard.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
