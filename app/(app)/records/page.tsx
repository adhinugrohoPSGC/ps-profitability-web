'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import { ClipboardList, DollarSign, Clock, TrendingUp, Trash2, RefreshCw, Search, X, Download, Building2 } from 'lucide-react'
import { useToast } from '@/components/Toast'
import DataTable, { type DataColumn } from '@/components/DataTable'
import { fetchAllRows } from '@/lib/fetchAll'
import MultiSelect from '@/components/MultiSelect'
import { buildFacets, type FacetDef } from '@/lib/facets'
import { useDebounce } from '@/lib/useDebounce'
import { SERVICE_OPTIONS } from '@/lib/serviceOptions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimesheetEntry {
  id: number
  entry_date: string
  consultant_name: string
  phase: string
  task_description: string
  hours: number
  cost_rate_sgd: number
  labour_cost_sgd: number
  bill_rate_sgd: number
  billable_value_sgd: number
  import_batch_id: string
}

interface TsSummary {
  name: string
  entries: number
  hours: number
  firstDate: string
  lastDate: string
}

interface ExpenseEntry {
  id: number
  identifier: string | null
  company_name: string | null
  country: string | null
  project_code_name: string | null
  prs_prj: string | null
  sales_person: string | null
  pm: string | null
  resource: string | null
  category: string
  expense_date: string | null
  month: string | null
  billable_to_client: boolean
  currency: string
  amount_native: number
  amount_sgd: number
  import_batch_id: string
}

interface VendorCost {
  id: number
  vendor_name: string
  description: string | null
  cost_date: string
  amount_sgd: number // 3rd party value (SGD) — what the dashboard counts as cost
  value_sgd: number | null
  psgc_portion: number | null
  third_party_portion: number | null
  service: string | null
  import_batch_id: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SGD', minimumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const TS_FACETS: FacetDef<TimesheetEntry>[] = [
  { key: 'consultant', label: 'All consultants', get: r => r.consultant_name },
  { key: 'phase', label: 'All phases', get: r => r.phase },
  { key: 'batch', label: 'All batches', get: r => r.import_batch_id },
]

const EX_FACETS: FacetDef<ExpenseEntry>[] = [
  { key: 'company', label: 'All companies', get: r => r.company_name },
  { key: 'country', label: 'All countries', get: r => r.country },
  { key: 'sales_person', label: 'All sales persons', get: r => r.sales_person },
  { key: 'pm', label: 'All PMs', get: r => r.pm },
  { key: 'resource', label: 'All resources', get: r => r.resource },
  { key: 'category', label: 'All categories', get: r => r.category },
  { key: 'month', label: 'All months', get: r => r.month },
  { key: 'billable', label: 'All billable', get: r => r.billable_to_client ? 'Yes' : 'No' },
  { key: 'batch', label: 'All batches', get: r => r.import_batch_id },
]

const VC_FACETS: FacetDef<VendorCost>[] = [
  { key: 'product', label: 'All products', get: r => r.vendor_name },
  { key: 'service', label: 'All services', get: r => r.service },
  { key: 'year', label: 'All years', get: r => r.cost_date?.slice(0, 4) },
]

const emptySel = (defs: { key: string }[]) => Object.fromEntries(defs.map(d => [d.key, [] as string[]]))

const fmtPortion = (v: number | null) => v == null ? '—' : `${Math.round(v * 100)}%`

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const { selectedProject } = useProject()
  const { toast } = useToast()
  const [tab, setTab] = useState<'timesheet' | 'expenses' | 'vendor'>('timesheet')
  const [timesheet, setTimesheet] = useState<TimesheetEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [vendorCosts, setVendorCosts] = useState<VendorCost[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 200)
  const [tsSel, setTsSel] = useState<Record<string, string[]>>(() => emptySel(TS_FACETS))
  const [exSel, setExSel] = useState<Record<string, string[]>>(() => emptySel(EX_FACETS))
  const [vcSel, setVcSel] = useState<Record<string, string[]>>(() => emptySel(VC_FACETS))
  const [vendorSavingId, setVendorSavingId] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedProject) { setTimesheet([]); setExpenses([]); setVendorCosts([]); return }
    setLoading(true)
    Promise.all([
      fetchAllRows<TimesheetEntry>('timesheet_entries', selectedProject, 'entry_date'),
      fetchAllRows<ExpenseEntry>('expense_entries', selectedProject, 'expense_date'),
      fetchAllRows<VendorCost>('vendor_costs', selectedProject, 'cost_date'),
    ]).then(([ts, ex, vc]) => {
      setTimesheet(ts)
      setExpenses(ex)
      setVendorCosts(vc)
    }).catch(() => toast('Failed to load records', 'error'))
      .finally(() => setLoading(false))
  }, [selectedProject, refreshKey])

  const tsFacets = useMemo(() =>
    buildFacets(timesheet, TS_FACETS, tsSel, debouncedSearch,
      r => [r.consultant_name, r.phase, r.task_description, r.import_batch_id]),
    [timesheet, tsSel, debouncedSearch])

  const exFacets = useMemo(() =>
    buildFacets(expenses, EX_FACETS, exSel, debouncedSearch,
      r => [r.identifier, r.company_name, r.country, r.project_code_name, r.sales_person, r.pm, r.resource, r.category, r.currency, r.import_batch_id]),
    [expenses, exSel, debouncedSearch])

  const vcFacets = useMemo(() =>
    buildFacets(vendorCosts, VC_FACETS, vcSel, debouncedSearch,
      r => [r.vendor_name, r.description, r.service]),
    [vendorCosts, vcSel, debouncedSearch])

  const filteredTs = tsFacets.filtered
  const filteredEx = exFacets.filtered
  const filteredVc = vcFacets.filtered

  // Timesheet tab shows hours summarised per team member, not per line
  const tsSummary = useMemo(() => {
    const map = new Map<string, TsSummary>()
    for (const r of filteredTs) {
      const name = r.consultant_name || '—'
      const cur = map.get(name)
      if (!cur) {
        map.set(name, { name, entries: 1, hours: r.hours ?? 0, firstDate: r.entry_date, lastDate: r.entry_date })
      } else {
        cur.entries += 1
        cur.hours += r.hours ?? 0
        if (r.entry_date < cur.firstDate) cur.firstDate = r.entry_date
        if (r.entry_date > cur.lastDate) cur.lastDate = r.entry_date
      }
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours)
  }, [filteredTs])

  // KPIs
  const totalHours = filteredTs.reduce((s, r) => s + (r.hours ?? 0), 0)
  const totalCost = filteredTs.reduce((s, r) => s + (r.labour_cost_sgd ?? 0), 0)
  const totalExpSgd = filteredEx.reduce((s, r) => s + (r.amount_sgd ?? 0), 0)
  const totalVendorSgd = filteredVc.reduce((s, r) => s + (r.amount_sgd ?? 0), 0)

  const activeSel = tab === 'timesheet' ? tsSel : tab === 'expenses' ? exSel : vcSel
  const hasFilter = !!search || Object.values(activeSel).some(v => v.length)
  const singleBatch = activeSel.batch?.length === 1 ? activeSel.batch[0] : null

  async function syncClickUp() {
    if (!selectedProject) return
    setSyncing(true)
    try {
      // Full-history window so project totals match ClickUp's all-time report
      const res = await fetch(`/api/sync-clickup-manual?projectId=${selectedProject}&windowDays=1100`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sync failed')
      toast(`Synced ${json.rows ?? 0} entries from ClickUp (last ${json.windowDays} days)`, 'success')
      setRefreshKey(k => k + 1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const [vendorSyncing, setVendorSyncing] = useState(false)
  async function syncVendors() {
    setVendorSyncing(true)
    try {
      const res = await fetch('/api/sync-vendor-manual', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sync failed')
      const skipped = json.skippedNoProject ? ` · ${json.skippedNoProject} rows without a matching project skipped` : ''
      toast(`Synced ${json.imported} vendor rows from the Google Sheet${skipped}`, 'success')
      setRefreshKey(k => k + 1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Vendor sync failed', 'error')
    } finally {
      setVendorSyncing(false)
    }
  }

  const [expSyncing, setExpSyncing] = useState(false)
  async function syncExpenses() {
    setExpSyncing(true)
    try {
      const res = await fetch('/api/sync-expenses-manual', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sync failed')
      const skipped = json.skippedNoProject ? ` · ${json.skippedNoProject} rows without a matching project skipped` : ''
      toast(`Synced ${json.imported} expense rows from the Google Sheet${skipped}`, 'success')
      setRefreshKey(k => k + 1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Expenses sync failed', 'error')
    } finally {
      setExpSyncing(false)
    }
  }

  // Service is the one vendor field owned here rather than by the sheet sync;
  // the nightly sync carries it forward (see app/api/sync-vendor/route.ts).
  async function updateVendorService(id: number, value: string) {
    const service = value || null
    setVendorSavingId(id)
    const { error } = await createClient().from('vendor_costs').update({ service }).eq('id', id)
    setVendorSavingId(null)
    if (error) { toast(error.message, 'error'); return }
    setVendorCosts(prev => prev.map(r => r.id === id ? { ...r, service } : r))
    toast(service ? `Service set to ${service}` : 'Service cleared', 'success')
  }

  async function deleteExpenseRow(id: number) {
    const { error } = await createClient().from('expense_entries').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setExpenses(prev => prev.filter(r => r.id !== id))
    toast('Row deleted', 'success')
  }

  async function deleteBatch(batchId: string) {
    if (!confirm(`Delete all rows for batch "${batchId}"?`)) return
    const table = tab === 'timesheet' ? 'timesheet_entries' : 'expense_entries'
    const { error } = await createClient().from(table).delete().eq('import_batch_id', batchId).eq('project_id', selectedProject!)
    if (error) { toast(error.message, 'error'); return }
    if (tab === 'timesheet') {
      setTimesheet(prev => prev.filter(r => r.import_batch_id !== batchId))
      setTsSel(s => ({ ...s, batch: [] }))
    } else {
      setExpenses(prev => prev.filter(r => r.import_batch_id !== batchId))
      setExSel(s => ({ ...s, batch: [] }))
    }
    toast('Batch deleted', 'success')
  }

  function resetFilters() {
    setSearch('')
    setTsSel(emptySel(TS_FACETS))
    setExSel(emptySel(EX_FACETS))
    setVcSel(emptySel(VC_FACETS))
  }

  const tsColumns: DataColumn<TsSummary>[] = [
    { key: 'member', label: 'Team Member', width: 220, sortValue: r => r.name.toLowerCase(),
      render: r => <span className="font-medium text-slate-800 truncate block" title={r.name}>{r.name}</span> },
    { key: 'entries', label: 'Entries', width: 90, align: 'right', sortValue: r => r.entries,
      render: r => <span className="font-mono text-slate-500">{r.entries}</span> },
    { key: 'first', label: 'First Entry', width: 120, sortValue: r => r.firstDate,
      render: r => <span className="font-mono text-xs text-slate-500">{r.firstDate}</span> },
    { key: 'last', label: 'Last Entry', width: 120, sortValue: r => r.lastDate,
      render: r => <span className="font-mono text-xs text-slate-500">{r.lastDate}</span> },
    { key: 'hours', label: 'Total Hrs', width: 110, align: 'right', sortValue: r => r.hours,
      render: r => <span className="font-mono text-slate-800 font-semibold">{r.hours.toFixed(1)}</span> },
  ]

  const exColumns: DataColumn<ExpenseEntry>[] = [
    { key: 'identifier', label: 'Identifier', width: 120, sortValue: r => r.identifier?.toLowerCase() || null,
      render: r => <span className="font-mono text-xs text-slate-600 truncate block" title={r.identifier ?? ''}>{r.identifier || '—'}</span> },
    { key: 'company', label: 'Company Name', width: 150, sortValue: r => r.company_name?.toLowerCase() || null,
      render: r => <span className="text-slate-700 truncate block" title={r.company_name ?? ''}>{r.company_name || '—'}</span> },
    { key: 'country', label: 'Country', width: 110, sortValue: r => r.country?.toLowerCase() || null,
      render: r => <span className="text-slate-500 truncate block" title={r.country ?? ''}>{r.country || '—'}</span> },
    { key: 'project_code', label: 'Project Code / Name', width: 220, sortValue: r => r.project_code_name?.toLowerCase() || null,
      render: r => <span className="text-slate-500 truncate block" title={r.project_code_name ?? ''}>{r.project_code_name || '—'}</span> },
    { key: 'prs_prj', label: 'PRS/PRJ', width: 90, sortValue: r => r.prs_prj?.toLowerCase() || null,
      render: r => <span className="text-slate-500 truncate block" title={r.prs_prj ?? ''}>{r.prs_prj || '—'}</span> },
    { key: 'sales_person', label: 'Sales Person', width: 130, sortValue: r => r.sales_person?.toLowerCase() || null,
      render: r => <span className="text-slate-700 truncate block" title={r.sales_person ?? ''}>{r.sales_person || '—'}</span> },
    { key: 'pm', label: 'PM', width: 120, sortValue: r => r.pm?.toLowerCase() || null,
      render: r => <span className="text-slate-700 truncate block" title={r.pm ?? ''}>{r.pm || '—'}</span> },
    { key: 'resource', label: 'Resource', width: 120, sortValue: r => r.resource?.toLowerCase() || null,
      render: r => <span className="text-slate-700 truncate block" title={r.resource ?? ''}>{r.resource || '—'}</span> },
    { key: 'category', label: 'Expense Category', width: 150, sortValue: r => r.category?.toLowerCase() || null,
      render: r => <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium truncate max-w-full" title={r.category}>{r.category || '—'}</span> },
    { key: 'date', label: 'Date', width: 110, sortValue: r => r.expense_date,
      render: r => <span className="font-mono text-xs text-slate-600 whitespace-nowrap">{fmtDate(r.expense_date)}</span> },
    { key: 'month', label: 'Month', width: 90, sortValue: r => r.month?.toLowerCase() || null,
      render: r => <span className="text-xs text-slate-500 whitespace-nowrap">{r.month || '—'}</span> },
    { key: 'billable', label: 'Billable to Client', width: 100, align: 'center', sortValue: r => (r.billable_to_client ? 1 : 0),
      render: r => r.billable_to_client
        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 font-medium">Yes</span>
        : <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500 font-medium">No</span> },
    { key: 'ccy', label: 'Currency', width: 80, sortValue: r => r.currency || null,
      render: r => <span className="text-slate-500 text-xs">{r.currency}</span> },
    { key: 'amount', label: 'Amount (Actual)', width: 130, align: 'right', sortValue: r => r.amount_native,
      render: r => <span className="font-mono text-slate-700">{r.amount_native?.toLocaleString()}</span> },
    { key: 'sgd', label: 'Amount (SGD)', width: 120, align: 'right', sortValue: r => r.amount_sgd,
      render: r => <span className="font-mono text-slate-800 font-medium">{r.amount_sgd != null ? fmt(r.amount_sgd) : '—'}</span> },
    { key: 'del', label: '', width: 44,
      render: r => (
        <button onClick={() => deleteExpenseRow(r.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete row">
          <Trash2 size={13} />
        </button>
      ) },
  ]

  const vendorColumns: DataColumn<VendorCost>[] = [
    { key: 'product', label: 'Product Name', width: 200, sortValue: r => r.vendor_name.toLowerCase(),
      render: r => <span className="font-medium text-slate-800 truncate block" title={r.vendor_name}>{r.vendor_name}</span> },
    { key: 'value', label: 'Value (SGD)', width: 120, align: 'right', sortValue: r => r.value_sgd,
      render: r => <span className="font-mono text-slate-700">{r.value_sgd != null ? fmt(r.value_sgd) : '—'}</span> },
    { key: 'psgc', label: 'PSGC Portion', width: 100, align: 'right', sortValue: r => r.psgc_portion,
      render: r => <span className="font-mono text-xs text-slate-600">{fmtPortion(r.psgc_portion)}</span> },
    { key: 'tp', label: '3rd Party Portion', width: 110, align: 'right', sortValue: r => r.third_party_portion,
      render: r => <span className="font-mono text-xs text-slate-600">{fmtPortion(r.third_party_portion)}</span> },
    { key: 'amount', label: '3rd Party Value (SGD)', width: 150, align: 'right', sortValue: r => r.amount_sgd,
      render: r => <span className="font-mono text-slate-800 font-medium">{fmt(r.amount_sgd)}</span> },
    { key: 'service', label: 'Service', width: 190, sortValue: r => r.service?.toLowerCase() || null,
      render: r => (
        <select
          value={r.service ?? ''}
          onChange={e => updateVendorService(r.id, e.target.value)}
          disabled={vendorSavingId === r.id}
          title="Set the service classification for this contract"
          className={`w-full text-xs border rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 ${
            r.service ? 'border-slate-200 text-slate-700' : 'border-slate-200 text-slate-400'
          }`}
        >
          <option value="">— not set —</option>
          {SERVICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) },
    { key: 'remark', label: 'Remark', width: 260, sortValue: r => r.description?.toLowerCase() || null,
      render: r => <span className="text-slate-500 truncate block" title={r.description ?? ''}>{r.description || '—'}</span> },
    { key: 'year', label: 'Year', width: 80, sortValue: r => r.cost_date,
      render: r => <span className="font-mono text-xs text-slate-600">{r.cost_date?.slice(0, 4) ?? '—'}</span> },
  ]

  if (!selectedProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a project to view records</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Records</h1>
          <p className="text-sm text-slate-400 mt-0.5">Timesheet, expense, and 3rd party vendor cost entries for this project</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncClickUp}
            disabled={syncing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            <Download size={12} className={syncing ? 'animate-bounce' : ''} /> {syncing ? 'Syncing…' : 'Sync ClickUp'}
          </button>
          <button
            onClick={syncExpenses}
            disabled={expSyncing || loading}
            title="Pull all expenses from the company expenses Google Sheet (also runs automatically every night)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 transition-colors"
          >
            <Download size={12} className={expSyncing ? 'animate-bounce' : ''} /> {expSyncing ? 'Syncing…' : 'Sync Expenses'}
          </button>
          <button
            onClick={syncVendors}
            disabled={vendorSyncing || loading}
            title="Pull 3rd party vendor records from the vendor Google Sheet (also runs automatically every night)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 transition-colors"
          >
            <Download size={12} className={vendorSyncing ? 'animate-bounce' : ''} /> {vendorSyncing ? 'Syncing…' : 'Sync Vendors'}
          </button>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      {tab === 'timesheet' ? (
        <div className="grid grid-cols-2 gap-4">
          <KpiCard label="Total Hours" value={totalHours.toFixed(1) + ' h'} sub={`${filteredTs.length} entries`} />
          <KpiCard label="Manpower Cost" value={fmt(totalCost)} />
        </div>
      ) : tab === 'expenses' ? (
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total Expenses (SGD)" value={fmt(totalExpSgd)} sub={`${filteredEx.length} entries`} />
          <KpiCard label="Billable to Client" value={filteredEx.filter(r => r.billable_to_client).length + ' / ' + filteredEx.length} />
          <KpiCard label="Categories" value={String(new Set(filteredEx.map(r => r.category)).size)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <KpiCard label="Total 3rd Party Value (SGD)" value={fmt(totalVendorSgd)} sub={`${filteredVc.length} entries`} />
          <KpiCard label="Products" value={String(new Set(filteredVc.map(r => r.vendor_name)).size)} />
        </div>
      )}

      {/* Search + facets */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'timesheet' ? 'Search consultant, phase, task…'
              : tab === 'expenses' ? 'Search identifier, company, PM, resource…'
              : 'Search product, remark…'}
            aria-label="Search records"
            className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {tab === 'timesheet'
          ? TS_FACETS.map(f => (
              <MultiSelect key={f.key} label={f.label} options={tsFacets.options[f.key]} selected={tsSel[f.key]}
                onChange={values => setTsSel(s => ({ ...s, [f.key]: values }))} />
            ))
          : tab === 'expenses'
          ? EX_FACETS.map(f => (
              <MultiSelect key={f.key} label={f.label} options={exFacets.options[f.key]} selected={exSel[f.key]}
                onChange={values => setExSel(s => ({ ...s, [f.key]: values }))} />
            ))
          : VC_FACETS.map(f => (
              <MultiSelect key={f.key} label={f.label} options={vcFacets.options[f.key]} selected={vcSel[f.key]}
                onChange={values => setVcSel(s => ({ ...s, [f.key]: values }))} />
            ))}
        {hasFilter && (
          <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-2">
            <X size={12} /> Reset
          </button>
        )}
        {singleBatch && tab !== 'vendor' && (
          <button
            onClick={() => deleteBatch(singleBatch)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={12} /> Delete batch
          </button>
        )}
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {tab === 'timesheet' ? `${filteredTs.length} / ${timesheet.length}`
            : tab === 'expenses' ? `${filteredEx.length} / ${expenses.length}`
            : `${filteredVc.length} / ${vendorCosts.length}`}
        </span>
      </div>

      {/* Tabs + table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setTab('timesheet')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${tab === 'timesheet' ? 'border-b-2 border-teal-500 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Clock size={14} /> Timesheet
            <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{timesheet.length}</span>
          </button>
          <button
            onClick={() => setTab('expenses')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${tab === 'expenses' ? 'border-b-2 border-teal-500 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <DollarSign size={14} /> Expenses
            <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{expenses.length}</span>
          </button>
          <button
            onClick={() => setTab('vendor')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${tab === 'vendor' ? 'border-b-2 border-teal-500 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Building2 size={14} /> 3rd Party Vendor
            <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{vendorCosts.length}</span>
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : tab === 'timesheet' ? (
          filteredTs.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              {hasFilter ? 'No timesheet entries match the current filters' : 'No timesheet entries found'}
            </div>
          ) : (
            <DataTable
              key="timesheet"
              columns={tsColumns}
              rows={tsSummary}
              rowKey={r => r.name}
              rowCap={50}
              footer={
                <tr>
                  <td className="px-3 py-2 text-slate-500">Totals · {tsSummary.length} team members</td>
                  <td className="px-3 py-2 text-right font-mono">{filteredTs.length}</td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-right font-mono">{totalHours.toFixed(1)}</td>
                </tr>
              }
            />
          )
        ) : tab === 'expenses' ? (
          filteredEx.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              {hasFilter ? 'No expense entries match the current filters' : 'No expense entries found'}
            </div>
          ) : (
            <DataTable
              key="expenses"
              columns={exColumns}
              rows={filteredEx}
              rowKey={r => r.id}
              rowCap={50}
              footer={
                <tr>
                  <td colSpan={14} className="px-3 py-2 text-right text-slate-500">Total (SGD) · {filteredEx.length} entries</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(totalExpSgd)}</td>
                  <td />
                </tr>
              }
            />
          )
        ) : (
          <div>
            {/* Vendor rows come exclusively from the 3rd Party Vendor Google
                Sheet — no manual entry; use "Sync Vendors" to refresh */}
            {filteredVc.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">
                {hasFilter ? 'No vendor rows match the current filters' : 'No 3rd party vendor costs recorded yet'}
              </div>
            ) : (
              <DataTable
                key="vendor"
                columns={vendorColumns}
                rows={filteredVc}
                rowKey={r => r.id}
                rowCap={50}
                footer={
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-slate-500">Total 3rd Party Value (SGD) · {filteredVc.length} entries</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(totalVendorSgd)}</td>
                    <td colSpan={3} />
                  </tr>
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Category breakdown for expenses */}
      {tab === 'expenses' && filteredEx.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Breakdown by Category</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Object.entries(
              filteredEx.reduce<Record<string, number>>((acc, r) => {
                const cat = r.category || 'Uncategorised'
                acc[cat] = (acc[cat] ?? 0) + (r.amount_sgd ?? 0)
                return acc
              }, {})
            ).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <span className="text-xs text-slate-600 truncate">{cat}</span>
                <span className="text-xs font-mono font-semibold text-slate-800 whitespace-nowrap">{fmt(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
