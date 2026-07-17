'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import { ClipboardList, DollarSign, Clock, TrendingUp, Trash2, RefreshCw, Search, X, Download } from 'lucide-react'
import { useToast } from '@/components/Toast'
import DataTable, { type DataColumn } from '@/components/DataTable'
import { fetchAllRows } from '@/lib/fetchAll'
import MultiSelect from '@/components/MultiSelect'
import { buildFacets, type FacetDef } from '@/lib/facets'

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
  expense_date: string
  category: string
  description: string
  vendor: string
  amount_native: number
  currency: string
  amount_sgd: number
  paid_by: string
  receipted: boolean
  notes: string
  import_batch_id: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SGD', minimumFractionDigits: 0 }).format(n)
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
  { key: 'category', label: 'All categories', get: r => r.category },
  { key: 'vendor', label: 'All vendors', get: r => r.vendor },
  { key: 'paid_by', label: 'All paid by', get: r => r.paid_by },
  { key: 'batch', label: 'All batches', get: r => r.import_batch_id },
]

const emptySel = (defs: { key: string }[]) => Object.fromEntries(defs.map(d => [d.key, [] as string[]]))

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const { selectedProject } = useProject()
  const { toast } = useToast()
  const [tab, setTab] = useState<'timesheet' | 'expenses'>('timesheet')
  const [timesheet, setTimesheet] = useState<TimesheetEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [tsSel, setTsSel] = useState<Record<string, string[]>>(() => emptySel(TS_FACETS))
  const [exSel, setExSel] = useState<Record<string, string[]>>(() => emptySel(EX_FACETS))

  useEffect(() => {
    if (!selectedProject) { setTimesheet([]); setExpenses([]); return }
    setLoading(true)
    Promise.all([
      fetchAllRows<TimesheetEntry>('timesheet_entries', selectedProject, 'entry_date'),
      fetchAllRows<ExpenseEntry>('expense_entries', selectedProject, 'expense_date'),
    ]).then(([ts, ex]) => {
      setTimesheet(ts)
      setExpenses(ex)
    }).catch(() => toast('Failed to load records', 'error'))
      .finally(() => setLoading(false))
  }, [selectedProject, refreshKey])

  const tsFacets = useMemo(() =>
    buildFacets(timesheet, TS_FACETS, tsSel, search,
      r => [r.consultant_name, r.phase, r.task_description, r.import_batch_id]),
    [timesheet, tsSel, search])

  const exFacets = useMemo(() =>
    buildFacets(expenses, EX_FACETS, exSel, search,
      r => [r.category, r.description, r.vendor, r.paid_by, r.currency, r.import_batch_id]),
    [expenses, exSel, search])

  const filteredTs = tsFacets.filtered
  const filteredEx = exFacets.filtered

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

  const activeSel = tab === 'timesheet' ? tsSel : exSel
  const hasFilter = !!search || Object.values(activeSel).some(v => v.length)
  const singleBatch = activeSel.batch?.length === 1 ? activeSel.batch[0] : null

  async function syncClickUp() {
    if (!selectedProject) return
    setSyncing(true)
    try {
      const res = await fetch(`/api/sync-clickup?projectId=${selectedProject}`, { method: 'POST' })
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
    { key: 'date', label: 'Date', width: 105, sortValue: r => r.expense_date,
      render: r => <span className="text-slate-600 whitespace-nowrap">{r.expense_date}</span> },
    { key: 'category', label: 'Category', width: 130, sortValue: r => r.category?.toLowerCase() || null,
      render: r => <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium truncate max-w-full" title={r.category}>{r.category || '—'}</span> },
    { key: 'description', label: 'Description', width: 180, sortValue: r => r.description?.toLowerCase() || null,
      render: r => <span className="text-slate-500 truncate block" title={r.description}>{r.description || '—'}</span> },
    { key: 'vendor', label: 'Vendor', width: 130, sortValue: r => r.vendor?.toLowerCase() || null,
      render: r => <span className="text-slate-500 truncate block" title={r.vendor}>{r.vendor || '—'}</span> },
    { key: 'amount', label: 'Amount', width: 100, align: 'right', sortValue: r => r.amount_native,
      render: r => <span className="font-mono text-slate-700">{r.amount_native?.toLocaleString()}</span> },
    { key: 'ccy', label: 'CCY', width: 60, sortValue: r => r.currency || null,
      render: r => <span className="text-slate-500 text-xs">{r.currency}</span> },
    { key: 'sgd', label: 'SGD', width: 110, align: 'right', sortValue: r => r.amount_sgd,
      render: r => <span className="font-mono text-slate-800 font-medium">{fmt(r.amount_sgd)}</span> },
    { key: 'paid_by', label: 'Paid By', width: 110, sortValue: r => r.paid_by?.toLowerCase() || null,
      render: r => <span className="text-slate-500 truncate block" title={r.paid_by}>{r.paid_by || '—'}</span> },
    { key: 'rcpt', label: 'Rcpt', width: 60, align: 'center', sortValue: r => (r.receipted ? 1 : 0),
      render: r => r.receipted
        ? <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
        : <span className="inline-block w-2 h-2 rounded-full bg-slate-200" /> },
    { key: 'batch', label: 'Batch', width: 110, sortValue: r => r.import_batch_id || null,
      render: r => <span className="text-xs text-slate-400 truncate block" title={r.import_batch_id}>{r.import_batch_id || '—'}</span> },
    { key: 'del', label: '', width: 44,
      render: r => (
        <button onClick={() => deleteExpenseRow(r.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete row">
          <Trash2 size={13} />
        </button>
      ) },
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
          <p className="text-sm text-slate-400 mt-0.5">Timesheet and expense entries for this project</p>
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
          <KpiCard label="Labour Cost" value={fmt(totalCost)} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total Expenses (SGD)" value={fmt(totalExpSgd)} sub={`${filteredEx.length} entries`} />
          <KpiCard label="Receipted" value={filteredEx.filter(r => r.receipted).length + ' / ' + filteredEx.length} />
          <KpiCard label="Categories" value={String(new Set(filteredEx.map(r => r.category)).size)} />
        </div>
      )}

      {/* Search + facets */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'timesheet' ? 'Search consultant, phase, task…' : 'Search category, vendor, description…'}
            aria-label="Search records"
            className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {tab === 'timesheet'
          ? TS_FACETS.map(f => (
              <MultiSelect key={f.key} label={f.label} options={tsFacets.options[f.key]} selected={tsSel[f.key]}
                onChange={values => setTsSel(s => ({ ...s, [f.key]: values }))} />
            ))
          : EX_FACETS.map(f => (
              <MultiSelect key={f.key} label={f.label} options={exFacets.options[f.key]} selected={exSel[f.key]}
                onChange={values => setExSel(s => ({ ...s, [f.key]: values }))} />
            ))}
        {hasFilter && (
          <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-2">
            <X size={12} /> Reset
          </button>
        )}
        {singleBatch && (
          <button
            onClick={() => deleteBatch(singleBatch)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={12} /> Delete batch
          </button>
        )}
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {tab === 'timesheet' ? `${filteredTs.length} / ${timesheet.length}` : `${filteredEx.length} / ${expenses.length}`}
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
        ) : (
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
                  <td colSpan={6} className="px-3 py-2 text-right text-slate-500">Total (SGD)</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(totalExpSgd)}</td>
                  <td colSpan={4} />
                </tr>
              }
            />
          )
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
