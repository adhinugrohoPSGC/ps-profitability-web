'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import { ReceiptText, ChevronDown, ChevronUp, RefreshCw, Search, ArrowUp, ArrowDown, X, Upload, Loader2, AlertTriangle } from 'lucide-react'
import MultiSelect, { type FacetOption } from '@/components/MultiSelect'
import Modal from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { parseBillingMilestonesXLS, type BillingMilestoneRow } from '@/lib/parseTemplates'
import { billingNameMatches } from '@/lib/billingMatch'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BillingMilestone {
  id: number
  source_row: number
  project_owner: string | null
  country: string | null
  project_manager: string | null
  project_name: string
  quotation_source: string | null
  billing_milestone: string | null
  billing_status: string | null
  invoice_status: string | null
  quarter: string | null
  commitment: string | null
  baseline_date: string | null
  estimate_date: string | null
  invoice_date: string | null
  invoice_due_date: string | null
  amount_sgd: number | null
}

type FacetKey = 'project_name' | 'project_manager' | 'billing_status' | 'invoice_status' | 'quarter' | 'commitment'

const FACETS: { key: FacetKey; label: string }[] = [
  { key: 'project_name', label: 'All projects' },
  { key: 'project_manager', label: 'All PMs' },
  { key: 'billing_status', label: 'All billing status' },
  { key: 'invoice_status', label: 'All invoice status' },
  { key: 'quarter', label: 'All quarters' },
  { key: 'commitment', label: 'All commitments' },
]

type SortKey = 'project_name' | 'project_owner' | 'billing_milestone' | 'quotation_source' | 'billing_status'
  | 'invoice_status' | 'quarter' | 'commitment' | 'baseline_date' | 'estimate_date' | 'invoice_date'
  | 'invoice_due_date' | 'amount_sgd'

const COLUMNS: { key: string; label: string; width: number; sort?: SortKey; align?: 'right' }[] = [
  { key: 'idx', label: '#', width: 44 },
  { key: 'project', label: 'Project', width: 420, sort: 'project_name' },
  { key: 'owner', label: 'Owner', width: 90, sort: 'project_owner' },
  { key: 'milestone', label: 'Billing Milestone', width: 190, sort: 'billing_milestone' },
  { key: 'quotation', label: 'Quotation Source', width: 140, sort: 'quotation_source' },
  { key: 'billing_status', label: 'Billing Status', width: 140, sort: 'billing_status' },
  { key: 'invoice_status', label: 'Invoice Status', width: 120, sort: 'invoice_status' },
  { key: 'quarter', label: 'Quarter', width: 90, sort: 'quarter' },
  { key: 'commitment', label: 'Commitment', width: 150, sort: 'commitment' },
  { key: 'baseline', label: 'Baseline', width: 105, sort: 'baseline_date' },
  { key: 'estimate', label: 'Estimate', width: 105, sort: 'estimate_date' },
  { key: 'invoice_date', label: 'Invoice Date', width: 105, sort: 'invoice_date' },
  { key: 'due', label: 'Due Date', width: 105, sort: 'invoice_due_date' },
  { key: 'amount', label: 'Amount (SGD)', width: 130, sort: 'amount_sgd', align: 'right' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSgd(n: number) {
  return 'S$ ' + new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return '—'
  const mon = d.toLocaleDateString('en-GB', { month: 'short' })
  return `${String(d.getDate()).padStart(2, '0')}/${mon}/${d.getFullYear()}`
}

function quarterKey(q: string | null) {
  const m = q?.match(/Q([1-4]):(\d{4})/)
  return m ? Number(m[2]) * 10 + Number(m[1]) : Infinity
}

function isPaid(r: BillingMilestone) {
  return (r.invoice_status ?? '').toLowerCase() === 'paid'
}

function isInvoiced(r: BillingMilestone) {
  return (r.billing_status ?? '').toLowerCase().includes('invoiced')
}

function sortValue(r: BillingMilestone, key: SortKey): string | number | null {
  if (key === 'amount_sgd') return r.amount_sgd
  if (key === 'quarter') return r.quarter ? quarterKey(r.quarter) : null
  const v = r[key]
  return v ? v.toLowerCase() : null
}

function StatusBadge({ value, tone }: { value: string | null; tone: 'billing' | 'invoice' | 'commitment' }) {
  if (!value) return <span className="text-slate-300">—</span>
  const v = value.toLowerCase()
  let cls = 'bg-slate-100 text-slate-600'
  if (tone === 'invoice') {
    if (v === 'paid') cls = 'bg-emerald-50 text-emerald-700'
    else if (v.includes('overdue') || v.includes('hold')) cls = 'bg-red-50 text-red-700'
    else cls = 'bg-amber-50 text-amber-700'
  } else if (v.includes('invoiced')) {
    cls = 'bg-amber-50 text-amber-700'
  }
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap max-w-full truncate align-bottom ${cls}`} title={value}>{value}</span>
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-800 font-mono">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const ROW_CAP = 100
const MIN_COL_WIDTH = 56
const IMPORT_CHUNK = 500

// Only pass through values Postgres will accept for a DATE column
function toDbDate(s: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router = useRouter()
  const { setSelectedProject } = useProject()
  const [rows, setRows] = useState<BillingMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<FacetKey, string[]>>({
    project_name: [], project_manager: [], billing_status: [], invoice_status: [], quarter: [], commitment: [],
  })
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(COLUMNS.map(c => [c.key, c.width])))
  const [showAll, setShowAll] = useState(false)
  const resizing = useRef(false)
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ rows: BillingMilestoneRow[]; warnings: string[]; fileName: string } | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  // Billing rows carry only a project name, so resolve it to a project id via
  // master_project.billing_sheet_name (fuzzy — the sheet truncates long names).
  const [projectLinks, setProjectLinks] = useState<{ id: string; sheetName: string }[]>([])
  useEffect(() => {
    createClient()
      .from('projects').select('id, master_project(billing_sheet_name)')
      .not('master_project_id', 'is', null)
      .then(({ data }) => {
        setProjectLinks(((data ?? []) as unknown as { id: string; master_project: { billing_sheet_name: string | null } | null }[])
          .map(p => ({ id: p.id, sheetName: p.master_project?.billing_sheet_name ?? '' }))
          .filter(p => p.sheetName))
      })
  }, [])

  useEffect(() => {
    setLoading(true); setError('')
    createClient()
      .from('billing_milestones')
      .select('*')
      .order('project_name')
      .order('source_row')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setRows((data ?? []) as BillingMilestone[])
        setLoading(false)
      })
  }, [refreshKey])

  const projectIdByName = useMemo(() => {
    const map = new Map<string, string>()
    if (projectLinks.length === 0) return map
    for (const name of new Set(rows.map(r => r.project_name))) {
      const hit = projectLinks.find(p => billingNameMatches(name, p.sheetName))
      if (hit) map.set(name, hit.id)
    }
    return map
  }, [rows, projectLinks])

  function openProject(id: string) {
    setSelectedProject(id)
    router.push('/dashboard')
  }

  // A row passes the search box + every facet, optionally ignoring one facet
  // (ignoring is what makes the dropdowns cascade instead of locking themselves).
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (r: BillingMilestone, ignore?: FacetKey) => {
      for (const { key } of FACETS) {
        if (key === ignore) continue
        const sel = filters[key]
        if (sel.length && !sel.includes(r[key] ?? '')) return false
      }
      if (!q) return true
      return [r.project_name, r.billing_milestone, r.billing_status, r.invoice_status, r.project_manager,
              r.project_owner, r.country, r.quarter, r.quotation_source, r.commitment]
        .some(v => v?.toLowerCase().includes(q))
    }
  }, [filters, search])

  // Faceted options: each dropdown lists only values present in rows that pass
  // every OTHER active filter, with row counts. Selected values stay listed.
  const facetOptions = useMemo(() => {
    const out = {} as Record<FacetKey, FacetOption[]>
    for (const { key } of FACETS) {
      const counts = new Map<string, number>()
      for (const r of rows) {
        const v = r[key]
        if (v && matches(r, key)) counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      for (const v of filters[key]) if (!counts.has(v)) counts.set(v, 0)
      const opts = [...counts.entries()].map(([value, count]) => ({ value, count }))
      opts.sort(key === 'quarter'
        ? (a, b) => quarterKey(a.value) - quarterKey(b.value)
        : (a, b) => a.value.localeCompare(b.value))
      out[key] = opts
    }
    return out
  }, [rows, filters, matches])

  const filtered = useMemo(() => {
    const list = rows.filter(r => matches(r))
    if (!sort) return list
    const { key, dir } = sort
    return [...list].sort((a, b) => {
      const va = sortValue(a, key), vb = sortValue(b, key)
      if (va == null && vb == null) return 0
      if (va == null) return 1 // nulls last regardless of direction
      if (vb == null) return -1
      if (va < vb) return -dir
      if (va > vb) return dir
      return 0
    })
  }, [rows, matches, sort])

  const totals = useMemo(() => {
    let total = 0, paid = 0, invoicedUnpaid = 0
    for (const r of filtered) {
      const amt = r.amount_sgd ?? 0
      total += amt
      if (isPaid(r)) paid += amt
      else if (isInvoiced(r)) invoicedUnpaid += amt
    }
    return { total, paid, invoicedUnpaid, outstanding: total - paid - invoicedUnpaid }
  }, [filtered])

  const display = showAll ? filtered : filtered.slice(0, ROW_CAP)
  const activeFilterCount = FACETS.reduce((n, f) => n + filters[f.key].length, 0)
  const hasFilter = !!search || activeFilterCount > 0
  const singleProject = filters.project_name.length === 1
  const tableWidth = COLUMNS.reduce((s, c) => s + widths[c.key], 0)

  function setFacet(key: FacetKey, values: string[]) {
    setFilters(f => ({ ...f, [key]: values }))
    setShowAll(false)
  }

  function toggleSort(key: SortKey) {
    setSort(s => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))
  }

  function startResize(e: React.MouseEvent, key: string) {
    e.preventDefault(); e.stopPropagation()
    resizing.current = true
    const startX = e.clientX
    const startW = widths[key]
    function move(ev: MouseEvent) {
      setWidths(w => ({ ...w, [key]: Math.max(MIN_COL_WIDTH, startW + ev.clientX - startX) }))
    }
    function up() {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      // let the click event that follows mouseup be ignored by the sort handler
      setTimeout(() => { resizing.current = false }, 0)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const buf = ev.target?.result
      if (!buf) return
      try {
        const { rows: parsed, warnings } = parseBillingMilestonesXLS(buf as ArrayBuffer)
        if (parsed.length === 0) {
          toast(warnings[0] ?? 'No billing milestone rows found in the file', 'warning')
          return
        }
        setPending({ rows: parsed, warnings, fileName: file.name })
      } catch (err) {
        toast(`Parse error: ${String(err)}`, 'error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function doImport() {
    if (!pending) return
    setImportBusy(true)
    const sb = createClient()
    try {
      // 1. Replace table contents
      const { error: delErr } = await sb.from('billing_milestones').delete().gte('id', 0)
      if (delErr) throw new Error(`Delete failed: ${delErr.message}`)

      const payload = pending.rows.map(r => ({
        source_row: r.source_row,
        project_owner: r.project_owner || null,
        country: r.country || null,
        project_manager: r.project_manager || null,
        project_name: r.project_name,
        quotation_source: r.quotation_source || null,
        billing_milestone: r.billing_milestone || null,
        billing_status: r.billing_status || null,
        invoice_status: r.invoice_status || null,
        quarter: r.quarter || null,
        commitment: r.commitment || null,
        baseline_date: toDbDate(r.baseline_date),
        estimate_date: toDbDate(r.estimate_date),
        invoice_date: toDbDate(r.invoice_date),
        invoice_due_date: toDbDate(r.invoice_due_date),
        amount_sgd: r.amount_sgd,
      }))
      for (let i = 0; i < payload.length; i += IMPORT_CHUNK) {
        const { error } = await sb.from('billing_milestones').insert(payload.slice(i, i + IMPORT_CHUNK))
        if (error) throw new Error(`Insert failed (rows ${i + 1}–${Math.min(i + IMPORT_CHUNK, payload.length)}): ${error.message}`)
      }

      // 2. Refresh derived contract values on linked projects. Matching
      // falls back to a prefix match to absorb the sheet's 80-char name
      // truncation — see lib/billingMatch.ts.
      const { data: projData, error: projErr } = await sb
        .from('projects')
        .select('id, contract_value, master_project_id, master_project(billing_sheet_name)')
        .not('master_project_id', 'is', null)
      if (projErr) throw new Error(`Contract value refresh failed: ${projErr.message}`)
      const projs = (projData ?? []) as unknown as {
        id: string
        contract_value: number | null
        master_project_id: string | null
        master_project: { billing_sheet_name: string | null } | null
      }[]
      let updated = 0
      for (const p of projs) {
        const sheetName = p.master_project?.billing_sheet_name
        if (!sheetName) continue
        const matched = pending.rows.filter(r => billingNameMatches(r.project_name, sheetName))
        if (matched.length === 0) continue
        const newValue = matched.reduce((s, r) => s + r.amount_sgd, 0)
        if (newValue === (p.contract_value ?? null)) continue
        const { error } = await sb.from('projects').update({ contract_value: newValue }).eq('id', p.id)
        if (error) throw new Error(`Contract value update failed for project ${p.id}: ${error.message}`)
        updated++
      }

      toast(`Imported ${payload.length} milestones${updated ? ` · updated ${updated} contract value${updated === 1 ? '' : 's'}` : ''}`, 'success')
      setPending(null)
      setRefreshKey(k => k + 1) // 3. Reload the billing list
    } catch (err) {
      toast(err instanceof Error ? err.message : `Import failed: ${String(err)}`, 'error')
    } finally {
      setImportBusy(false)
    }
  }

  const pendingSummary = useMemo(() => {
    if (!pending) return null
    const projects = new Set(pending.rows.map(r => r.project_name)).size
    const total = pending.rows.reduce((s, r) => s + r.amount_sgd, 0)
    return { projects, total }
  }, [pending])

  const [syncBusy, setSyncBusy] = useState(false)
  async function handleSheetSync() {
    setSyncBusy(true)
    try {
      const res = await fetch('/api/sync-billing-manual', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      toast(`Synced ${json.milestones} milestones from the Google Sheet · ${json.valuesUpdated} project value${json.valuesUpdated === 1 ? '' : 's'} updated`, 'success')
      setRefreshKey(k => k + 1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sheet sync failed', 'error')
    } finally {
      setSyncBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Billing Milestones</h1>
          <p className="text-sm text-slate-400 mt-0.5">From the PMO ERP Service Billing Milestone tracking sheet</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleSheetSync}
            disabled={syncBusy}
            title="Pull the latest data from the PMO Google Sheet (also runs automatically every night)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {syncBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync from Sheet
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 transition-colors"
          >
            {importBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Import file
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={singleProject ? 'Contract Value' : 'Total Billing Value'}
          value={fmtSgd(totals.total)}
          sub={`${filtered.length} milestone${filtered.length === 1 ? '' : 's'}${singleProject ? ' · sum of this project' : ''}`}
        />
        <KpiCard label="Paid" value={fmtSgd(totals.paid)} />
        <KpiCard label="Invoiced (unpaid)" value={fmtSgd(totals.invoicedUnpaid)} />
        <KpiCard label="Outstanding" value={fmtSgd(totals.outstanding)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search milestones, projects, status…"
            aria-label="Search billing milestones"
            className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {FACETS.map(f => (
          <MultiSelect
            key={f.key}
            label={f.label}
            options={facetOptions[f.key]}
            selected={filters[f.key]}
            onChange={values => setFacet(f.key, values)}
          />
        ))}
        {hasFilter && (
          <button
            onClick={() => {
              setSearch('')
              setFilters({ project_name: [], project_manager: [], billing_status: [], invoice_status: [], quarter: [], commitment: [] })
            }}
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
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">
            Failed to load billing data: {error}
            <button onClick={() => setRefreshKey(k => k + 1)} className="block mx-auto mt-2 text-xs text-blue-600 hover:underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <ReceiptText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{hasFilter ? 'No milestones match the current filters' : 'No billing milestones imported yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: tableWidth }}>
              <colgroup>
                {COLUMNS.map(c => <col key={c.key} style={{ width: widths[c.key] }} />)}
              </colgroup>
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <tr>
                  {COLUMNS.map(c => {
                    const sorted = sort?.key === c.sort && c.sort
                    return (
                      <th
                        key={c.key}
                        aria-sort={sorted ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                        className={`relative px-3 py-2.5 font-medium whitespace-nowrap select-none ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        {c.sort ? (
                          <button
                            onClick={() => { if (!resizing.current) toggleSort(c.sort!) }}
                            className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 ${sorted ? 'text-teal-600' : ''}`}
                          >
                            {c.label}
                            {sorted && (sort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                          </button>
                        ) : c.label}
                        <span
                          onMouseDown={e => startResize(e, c.key)}
                          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-teal-300/60"
                          aria-hidden="true"
                        />
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {display.map((r, i) => {
                  const projectId = projectIdByName.get(r.project_name)
                  return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 overflow-hidden">
                      {projectId ? (
                        <button
                          onClick={() => openProject(projectId)}
                          title="Open this project's dashboard"
                          className="font-medium text-teal-700 hover:underline truncate block text-left w-full"
                        >
                          {r.project_name}
                        </button>
                      ) : (
                        <p className="font-medium text-slate-800 truncate" title={r.project_name}>{r.project_name}</p>
                      )}
                      <p className="text-xs text-slate-400 truncate">{[r.project_manager, r.country].filter(Boolean).join(' · ') || '—'}</p>
                    </td>
                    <td className="px-3 py-2 overflow-hidden text-slate-500 truncate" title={r.project_owner ?? ''}>{r.project_owner || '—'}</td>
                    <td className="px-3 py-2 overflow-hidden text-slate-700 truncate" title={r.billing_milestone ?? ''}>{r.billing_milestone || '—'}</td>
                    <td className="px-3 py-2 overflow-hidden text-slate-500 truncate" title={r.quotation_source ?? ''}>{r.quotation_source || '—'}</td>
                    <td className="px-3 py-2 overflow-hidden"><StatusBadge value={r.billing_status} tone="billing" /></td>
                    <td className="px-3 py-2 overflow-hidden"><StatusBadge value={r.invoice_status} tone="invoice" /></td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 truncate">{r.quarter || '—'}</td>
                    <td className="px-3 py-2 overflow-hidden"><StatusBadge value={r.commitment} tone="commitment" /></td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 truncate">{fmtDate(r.baseline_date)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 truncate">{fmtDate(r.estimate_date)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 truncate">{fmtDate(r.invoice_date)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 truncate">{fmtDate(r.invoice_due_date)}</td>
                    <td className="px-3 py-2 font-mono text-right text-slate-800 font-medium truncate">
                      {r.amount_sgd != null ? fmtSgd(r.amount_sgd) : '—'}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-semibold text-slate-700">
                <tr>
                  <td colSpan={COLUMNS.length - 1} className="px-3 py-2 text-right text-slate-500">
                    {singleProject ? 'Contract value (sum of project milestones)' : 'Total (filtered)'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmtSgd(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!loading && !error && filtered.length > ROW_CAP && (
          <div className="px-4 py-3 border-t border-slate-100">
            <button onClick={() => setShowAll(v => !v)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {filtered.length} rows</>}
            </button>
          </div>
        )}
      </div>

      {/* Import confirmation modal */}
      <Modal
        open={pending !== null}
        title="Replace Billing Milestones"
        onClose={() => { if (!importBusy) setPending(null) }}
      >
        {pending && pendingSummary && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>{pending.fileName}</strong> contains{' '}
              <strong>{pending.rows.length} milestone{pending.rows.length === 1 ? '' : 's'}</strong> across{' '}
              <strong>{pendingSummary.projects} project{pendingSummary.projects === 1 ? '' : 's'}</strong>, totalling{' '}
              <strong className="font-mono">{fmtSgd(pendingSummary.total)}</strong>.
            </p>
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Importing will <strong>delete all {rows.length} existing milestones</strong> and replace them with
                the uploaded data. Linked project contract values will be recalculated.
              </p>
            </div>
            {pending.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
                {pending.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />{w}
                  </p>
                ))}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setPending(null)}
                disabled={importBusy}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={doImport}
                disabled={importBusy}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {importBusy && <Loader2 size={14} className="animate-spin" />}
                {importBusy ? 'Importing…' : `Replace & Import (${pending.rows.length} rows)`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
