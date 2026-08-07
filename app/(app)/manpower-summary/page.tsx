'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts'
import { HardHat, Search, X, CalendarRange } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import DataTable, { type DataColumn } from '@/components/DataTable'
import MultiSelect from '@/components/MultiSelect'
import { buildFacets, type FacetDef } from '@/lib/facets'
import { useDebounce } from '@/lib/useDebounce'

// Cross-project manpower cost summary: every consultant's tracked hours and
// labour cost across all projects, with project-level facets and a cost
// date range (aggregation runs server-side via person_cost_summary).

interface ProjectLite {
  id: string
  name: string
  project_manager: string | null
  master_project?: { team: string | null; region: string | null } | null
}
interface PersonRow { project_id: string; consultant_name: string; hours: number; cost: number }
interface PersonSummary { name: string; projects: number; hours: number; cost: number }

const fmt = (n: number) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(n)
const BAR_CAP = 15

const FACETS: FacetDef<ProjectLite>[] = [
  { key: 'team', label: 'All teams', get: p => p.master_project?.team },
  { key: 'region', label: 'All regions', get: p => p.master_project?.region },
  { key: 'pm', label: 'All PMs', get: p => p.project_manager },
]

export default function ManpowerSummaryPage() {
  const { toast } = useToast()
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [personRows, setPersonRows] = useState<PersonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 200)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [facetSel, setFacetSel] = useState<Record<string, string[]>>(
    () => Object.fromEntries(FACETS.map(f => [f.key, [] as string[]])))

  useEffect(() => {
    setLoading(true)
    const sb = createClient()
    Promise.all([
      sb.from('projects').select('id, name, project_manager, master_project(team, region)').neq('status', 'archived'),
      sb.rpc('person_cost_summary', { date_from: dateFrom || null, date_to: dateTo || null }),
    ]).then(([proj, people]) => {
      setProjects((proj.data ?? []) as unknown as ProjectLite[])
      setPersonRows(((people.data ?? []) as PersonRow[]).map(r => ({ ...r, hours: Number(r.hours), cost: Number(r.cost) })))
    }).catch(() => toast('Failed to load manpower data', 'error'))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, toast])

  const facets = useMemo(() =>
    buildFacets(projects, FACETS, facetSel, '', p => [p.name]),
    [projects, facetSel])
  const filteredIds = useMemo(() => new Set(facets.filtered.map(p => p.id)), [facets])

  const byPerson = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const map = new Map<string, PersonSummary & { projectIds: Set<string> }>()
    for (const r of personRows) {
      if (!filteredIds.has(r.project_id)) continue
      if (q && !r.consultant_name.toLowerCase().includes(q)) continue
      const g = map.get(r.consultant_name) ?? { name: r.consultant_name, projects: 0, hours: 0, cost: 0, projectIds: new Set<string>() }
      g.hours += r.hours
      g.cost += r.cost
      g.projectIds.add(r.project_id)
      map.set(r.consultant_name, g)
    }
    return [...map.values()]
      .map(g => ({ name: g.name, projects: g.projectIds.size, hours: g.hours, cost: g.cost }))
      .sort((a, b) => b.hours - a.hours)
  }, [personRows, filteredIds, debouncedSearch])

  const totals = useMemo(() => ({
    cost: byPerson.reduce((s, p) => s + p.cost, 0),
    hours: byPerson.reduce((s, p) => s + p.hours, 0),
  }), [byPerson])

  const hasFilter = !!search || !!dateFrom || !!dateTo || Object.values(facetSel).some(v => v.length)
  const dateInputCls = 'border border-slate-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700'

  const columns: DataColumn<PersonSummary>[] = [
    { key: 'name', label: 'Person', width: 260, sortValue: r => r.name.toLowerCase(),
      render: r => <span className="font-medium text-slate-800 truncate block" title={r.name}>{r.name}</span> },
    { key: 'projects', label: 'Projects', width: 100, align: 'right', sortValue: r => r.projects,
      render: r => <span className="font-mono text-slate-500">{r.projects}</span> },
    { key: 'hours', label: 'Hours', width: 130, align: 'right', sortValue: r => r.hours,
      render: r => <span className="font-mono text-slate-800 font-semibold">{r.hours.toFixed(1)}</span> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Man Power Cost</h1>
        <p className="text-sm text-slate-400 mt-0.5">Tracked hours per person across all projects · cost is shown as a total only</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Manpower Cost', value: fmt(totals.cost) },
          { label: 'Total Hours', value: `${totals.hours.toFixed(1)} h` },
          { label: 'People', value: String(byPerson.length) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Search + facets + date range */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search person…"
            aria-label="Search people"
            className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {FACETS.map(f => (
          <MultiSelect key={f.key} label={f.label} options={facets.options[f.key]} selected={facetSel[f.key]}
            onChange={values => setFacetSel(s => ({ ...s, [f.key]: values }))} />
        ))}
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide ml-1">
          <CalendarRange size={14} className="text-slate-400" /> Period
        </span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={dateInputCls} aria-label="From date" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={dateInputCls} aria-label="To date" />
        {hasFilter && (
          <button
            onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setFacetSel(Object.fromEntries(FACETS.map(f => [f.key, []]))) }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-2"
          >
            <X size={12} /> Reset
          </button>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Hours by Person</h3>
          <span className="text-xs text-slate-400">{byPerson.length > BAR_CAP ? `Top ${BAR_CAP} of ${byPerson.length}` : `${byPerson.length} people`}</span>
        </div>
        {byPerson.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No timesheet data for the current filters</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={byPerson.slice(0, BAR_CAP)} margin={{ top: 4, right: 8, bottom: 70, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={85} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toLocaleString()} h`} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <ReTooltip cursor={{ fill: '#f8fafc' }} formatter={(v: any, _n: any, item: any) =>
                [`${Number(v).toFixed(1)} h · ${item?.payload?.projects ?? 0} project(s)`, 'Hours']} />
              <Bar dataKey="hours" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : byPerson.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <HardHat size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No manpower data matches the current filters</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={byPerson}
            rowKey={r => r.name}
            rowCap={50}
            footer={
              <tr>
                <td className="px-3 py-2 text-slate-500">Totals · {byPerson.length} people</td>
                <td />
                <td className="px-3 py-2 text-right font-mono">{totals.hours.toFixed(1)}</td>
              </tr>
            }
          />
        )}
      </div>
    </div>
  )
}
