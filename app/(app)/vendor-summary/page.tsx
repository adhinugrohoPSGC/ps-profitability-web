'use client'
import { useState, useEffect, useMemo } from 'react'
import { Building2, Search, X, Download, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import { useToast } from '@/components/Toast'
import DataTable, { type DataColumn } from '@/components/DataTable'
import MultiSelect from '@/components/MultiSelect'
import { buildFacets, type FacetDef } from '@/lib/facets'
import { useDebounce } from '@/lib/useDebounce'

// Cross-project summary of every 3rd party vendor contract (source: the
// 3rd Party Vendor Google Sheet, synced nightly).

interface VendorRow {
  id: number
  project_id: string
  vendor_name: string
  description: string | null
  cost_date: string | null
  amount_sgd: number
  value_sgd: number | null
  psgc_portion: number | null
  third_party_portion: number | null
  service: string | null
  // joined client-side
  project_name: string
  team: string
  region: string
}

const fmt = (n: number) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(n)
const fmtPortion = (v: number | null) => v == null ? '—' : `${Math.round(v * 100)}%`

const FACETS: FacetDef<VendorRow>[] = [
  { key: 'product', label: 'All products', get: r => r.vendor_name },
  { key: 'service', label: 'All services', get: r => r.service },
  { key: 'team', label: 'All teams', get: r => r.team },
  { key: 'region', label: 'All regions', get: r => r.region },
  { key: 'year', label: 'All years', get: r => r.cost_date?.slice(0, 4) },
]

export default function VendorSummaryPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { setSelectedProject } = useProject()
  const [rows, setRows] = useState<VendorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 200)
  const [facetSel, setFacetSel] = useState<Record<string, string[]>>(
    () => Object.fromEntries(FACETS.map(f => [f.key, [] as string[]])))
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setLoading(true)
    const sb = createClient()
    Promise.all([
      sb.from('vendor_costs').select('id, project_id, vendor_name, description, cost_date, amount_sgd, value_sgd, psgc_portion, third_party_portion, service'),
      sb.from('projects').select('id, name, master_project(team, region)'),
    ]).then(([vc, proj]) => {
      const projMap = new Map(((proj.data ?? []) as unknown as { id: string; name: string; master_project: { team: string | null; region: string | null } | null }[])
        .map(p => [p.id, p]))
      setRows(((vc.data ?? []) as Omit<VendorRow, 'project_name' | 'team' | 'region'>[]).map(r => {
        const p = projMap.get(r.project_id)
        return {
          ...r,
          amount_sgd: Number(r.amount_sgd ?? 0),
          value_sgd: r.value_sgd == null ? null : Number(r.value_sgd),
          project_name: p?.name ?? '(unknown project)',
          team: p?.master_project?.team?.trim() || 'Unassigned',
          region: p?.master_project?.region?.trim() || 'Unassigned',
        }
      }))
    }).catch(() => toast('Failed to load vendor data', 'error'))
      .finally(() => setLoading(false))
  }, [refreshKey, toast])

  const facets = useMemo(() =>
    buildFacets(rows, FACETS, facetSel, debouncedSearch,
      r => [r.project_name, r.vendor_name, r.description, r.service]),
    [rows, facetSel, debouncedSearch])

  // Jump straight into the project's own dashboard
  function openProject(id: string) {
    setSelectedProject(id)
    router.push('/dashboard')
  }
  const filtered = facets.filtered
  const hasFilter = !!search || Object.values(facetSel).some(v => v.length)

  const total = filtered.reduce((s, r) => s + r.amount_sgd, 0)
  const totalValue = filtered.reduce((s, r) => s + (r.value_sgd ?? 0), 0)

  async function syncVendors() {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync-vendor-manual', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sync failed')
      toast(`Synced ${json.imported} vendor rows from the Google Sheet`, 'success')
      setRefreshKey(k => k + 1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Vendor sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const columns: DataColumn<VendorRow>[] = [
    { key: 'project', label: 'Project', width: 320, sortValue: r => r.project_name.toLowerCase(),
      render: r => (
        <button
          onClick={() => openProject(r.project_id)}
          title="Open this project's dashboard"
          className="font-medium text-teal-700 hover:underline truncate block text-left w-full"
        >
          {r.project_name}
        </button>
      ) },
    { key: 'team', label: 'Team', width: 90, sortValue: r => r.team,
      render: r => <span className="text-slate-500 text-xs">{r.team}</span> },
    { key: 'region', label: 'Region', width: 100, sortValue: r => r.region,
      render: r => <span className="text-slate-500 text-xs">{r.region}</span> },
    { key: 'product', label: 'Product Name', width: 180, sortValue: r => r.vendor_name.toLowerCase(),
      render: r => <span className="text-slate-700 truncate block" title={r.vendor_name}>{r.vendor_name}</span> },
    { key: 'value', label: 'Value (SGD)', width: 120, align: 'right', sortValue: r => r.value_sgd,
      render: r => <span className="font-mono text-slate-700">{r.value_sgd != null ? fmt(r.value_sgd) : '—'}</span> },
    { key: 'psgc', label: 'PSGC Portion', width: 100, align: 'right', sortValue: r => r.psgc_portion,
      render: r => <span className="font-mono text-xs text-slate-600">{fmtPortion(r.psgc_portion)}</span> },
    { key: 'tp', label: '3rd Party Portion', width: 110, align: 'right', sortValue: r => r.third_party_portion,
      render: r => <span className="font-mono text-xs text-slate-600">{fmtPortion(r.third_party_portion)}</span> },
    { key: 'amount', label: '3rd Party Value (SGD)', width: 150, align: 'right', sortValue: r => r.amount_sgd,
      render: r => <span className="font-mono text-slate-800 font-medium">{fmt(r.amount_sgd)}</span> },
    { key: 'service', label: 'Service', width: 180, sortValue: r => r.service?.toLowerCase() || null,
      render: r => r.service
        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-teal-50 text-teal-700 font-medium truncate max-w-full" title={r.service}>{r.service}</span>
        : <span className="text-slate-300 text-xs">not set</span> },
    { key: 'remark', label: 'Remark', width: 260, sortValue: r => r.description?.toLowerCase() || null,
      render: r => <span className="text-slate-500 truncate block" title={r.description ?? ''}>{r.description || '—'}</span> },
    { key: 'year', label: 'Year', width: 80, sortValue: r => r.cost_date,
      render: r => <span className="font-mono text-xs text-slate-600">{r.cost_date?.slice(0, 4) ?? '—'}</span> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">3rd Party Vendor</h1>
          <p className="text-sm text-slate-400 mt-0.5">All vendor contracts across projects — from the 3rd Party Vendor sheet</p>
        </div>
        <button
          onClick={syncVendors}
          disabled={syncing || loading}
          title="Pull the latest data from the vendor Google Sheet (also runs automatically every night)"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 transition-colors"
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} {syncing ? 'Syncing…' : 'Sync Vendors'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total 3rd Party Value', value: fmt(total) },
          { label: 'Total Contract Value', value: fmt(totalValue) },
          { label: 'Contracts', value: String(filtered.length) },
          { label: 'Products', value: String(new Set(filtered.map(r => r.vendor_name)).size) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Search + facets */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project, product, remark…"
            aria-label="Search vendor contracts"
            className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {FACETS.map(f => (
          <MultiSelect key={f.key} label={f.label} options={facets.options[f.key]} selected={facetSel[f.key]}
            onChange={values => setFacetSel(s => ({ ...s, [f.key]: values }))} />
        ))}
        {hasFilter && (
          <button
            onClick={() => { setSearch(''); setFacetSel(Object.fromEntries(FACETS.map(f => [f.key, []]))) }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-2"
          >
            <X size={12} /> Reset
          </button>
        )}
        <span className="text-xs text-slate-400 whitespace-nowrap">{filtered.length} / {rows.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{hasFilter ? 'No vendor contracts match the current filters' : 'No vendor contracts yet — run Sync Vendors'}</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={r => r.id}
            rowCap={50}
            footer={
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right text-slate-500">Total 3rd Party Value (SGD) · {filtered.length} contracts</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(total)}</td>
                <td colSpan={3} />
              </tr>
            }
          />
        )}
      </div>
    </div>
  )
}
