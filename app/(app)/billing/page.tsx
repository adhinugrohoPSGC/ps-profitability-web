'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReceiptText, ChevronDown, ChevronUp, RefreshCw, Search } from 'lucide-react'

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
  // "Q3:2025" → 20253 for chronological sort; unknowns last
  const m = q?.match(/Q([1-4]):(\d{4})/)
  return m ? Number(m[2]) * 10 + Number(m[1]) : Infinity
}

function isPaid(r: BillingMilestone) {
  return (r.invoice_status ?? '').toLowerCase() === 'paid'
}

function isInvoiced(r: BillingMilestone) {
  return (r.billing_status ?? '').toLowerCase().includes('invoiced')
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
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>{value}</span>
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

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={label}
      className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 max-w-[180px]"
    >
      <option value="">{label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

const ROW_CAP = 100

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [rows, setRows] = useState<BillingMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const [fProject, setFProject] = useState('')
  const [fPm, setFPm] = useState('')
  const [fBilling, setFBilling] = useState('')
  const [fInvoice, setFInvoice] = useState('')
  const [fQuarter, setFQuarter] = useState('')
  const [fCommitment, setFCommitment] = useState('')
  const [showAll, setShowAll] = useState(false)

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

  const opts = useMemo(() => {
    const uniq = (get: (r: BillingMilestone) => string | null) =>
      [...new Set(rows.map(get).filter((v): v is string => !!v))].sort()
    return {
      projects: uniq(r => r.project_name),
      pms: uniq(r => r.project_manager),
      billing: uniq(r => r.billing_status),
      invoice: uniq(r => r.invoice_status),
      quarters: uniq(r => r.quarter).sort((a, b) => quarterKey(a) - quarterKey(b)),
      commitments: uniq(r => r.commitment),
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (!fProject || r.project_name === fProject) &&
      (!fPm || r.project_manager === fPm) &&
      (!fBilling || r.billing_status === fBilling) &&
      (!fInvoice || r.invoice_status === fInvoice) &&
      (!fQuarter || r.quarter === fQuarter) &&
      (!fCommitment || r.commitment === fCommitment) &&
      (!q || [r.project_name, r.billing_milestone, r.billing_status, r.invoice_status,
              r.project_manager, r.project_owner, r.country, r.quarter, r.quotation_source, r.commitment]
        .some(v => v?.toLowerCase().includes(q)))
    )
  }, [rows, search, fProject, fPm, fBilling, fInvoice, fQuarter, fCommitment])

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
  const hasFilter = !!(search || fProject || fPm || fBilling || fInvoice || fQuarter || fCommitment)

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Billing Milestones</h1>
          <p className="text-sm text-slate-400 mt-0.5">From the PMO ERP Service Billing Milestone tracking sheet</p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={fProject ? 'Contract Value' : 'Total Billing Value'}
          value={fmtSgd(totals.total)}
          sub={`${filtered.length} milestone${filtered.length === 1 ? '' : 's'}${fProject ? ' · sum of this project' : ''}`}
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
        <FilterSelect label="All projects" value={fProject} onChange={setFProject} options={opts.projects} />
        <FilterSelect label="All PMs" value={fPm} onChange={setFPm} options={opts.pms} />
        <FilterSelect label="All billing status" value={fBilling} onChange={setFBilling} options={opts.billing} />
        <FilterSelect label="All invoice status" value={fInvoice} onChange={setFInvoice} options={opts.invoice} />
        <FilterSelect label="All quarters" value={fQuarter} onChange={setFQuarter} options={opts.quarters} />
        <FilterSelect label="All commitments" value={fCommitment} onChange={setFCommitment} options={opts.commitments} />
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
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <tr>
                  {['#', 'Project', 'Owner', 'Billing Milestone', 'Quotation Source', 'Billing Status', 'Invoice Status',
                    'Quarter', 'Commitment', 'Baseline', 'Estimate', 'Invoice Date', 'Due Date', 'Amount (SGD)'].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 font-medium whitespace-nowrap ${i === 13 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {display.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 min-w-[220px] max-w-[320px]">
                      <p className="font-medium text-slate-800 truncate" title={r.project_name}>{r.project_name}</p>
                      <p className="text-xs text-slate-400">{[r.project_manager, r.country].filter(Boolean).join(' · ') || '—'}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.project_owner || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.billing_milestone || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.quotation_source || '—'}</td>
                    <td className="px-3 py-2"><StatusBadge value={r.billing_status} tone="billing" /></td>
                    <td className="px-3 py-2"><StatusBadge value={r.invoice_status} tone="invoice" /></td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-600">{r.quarter || '—'}</td>
                    <td className="px-3 py-2"><StatusBadge value={r.commitment} tone="commitment" /></td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-500">{fmtDate(r.baseline_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-500">{fmtDate(r.estimate_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-600">{fmtDate(r.invoice_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-600">{fmtDate(r.invoice_due_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-right text-slate-800 font-medium">
                      {r.amount_sgd != null ? fmtSgd(r.amount_sgd) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-semibold text-slate-700">
                <tr>
                  <td colSpan={13} className="px-3 py-2 text-right text-slate-500">
                    {fProject ? 'Contract value (sum of project milestones)' : 'Total (filtered)'}
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
    </div>
  )
}
