'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, BarChart2, AlertCircle, CalendarRange, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/fetchAll'
import { useProject } from '@/contexts/ProjectContext'
import Modal from '@/components/Modal'
import { billingNameMatches, billingNamePrefixToken } from '@/lib/billingMatch'

interface Project {
  id: string; name: string; contract_value: number
  contract_currency: string; billing_type: string
  project_manager: string | null; start_date: string | null; end_date: string | null
  status: string; notes: string | null; master_project_id: string | null
}
interface TimesheetEntry {
  id: number; consultant_name: string; phase: string; hours: number
  cost_rate_sgd: number; labour_cost_sgd: number; bill_rate_sgd: number; billable_value_sgd: number
  entry_date: string | null
}
interface ExpenseEntry { id: number; category: string; amount_sgd: number; expense_date: string | null }
interface VendorCost { id: number; amount_sgd: number; cost_date: string | null; vendor_name: string | null; description: string | null }
interface BillingRow { project_name: string; amount_sgd: number | null; billing_milestone: string | null; invoice_status: string | null }
interface Settings { overhead_rate_pct?: string; [key: string]: string | undefined }

const DEFAULT_SGA_RATE_PCT = 30

const fmt = (v: number) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(v)
const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-600', completed: 'text-blue-600', archived: 'text-slate-400', 'on-hold': 'text-amber-600',
}

function InfoField({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-slate-800 ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}
function marginColor(pct: number) { return pct >= 30 ? 'text-emerald-600' : pct >= 15 ? 'text-amber-500' : 'text-red-500' }
const fmtPct = (v: number) => `${v.toFixed(1)}%`
const COST_COLORS = { manpower: '#10b981', expenses: '#3b82f6', vendor: '#8b5cf6', sga: '#f59e0b' }

type DrillSegment =
  | 'Manpower Cost' | 'Expenses' | '3rd Party Vendor Cost' | 'SG&A'
  | 'Total Revenue' | 'Gross Profit' | 'Net Profit' | 'Total Cost'

function CalcRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${bold ? 'bg-slate-50 font-semibold' : ''}`}>
      <span className={bold ? 'text-slate-700' : 'text-slate-500'}>{label}</span>
      <span className={bold ? 'text-slate-900' : 'font-medium text-slate-800'}>{value}</span>
    </div>
  )
}

export default function DashboardPage() {
  const { selectedProject } = useProject()
  const [project, setProject] = useState<Project | null>(null)
  const [timesheet, setTimesheet] = useState<TimesheetEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [vendorCosts, setVendorCosts] = useState<VendorCost[]>([])
  const [billing, setBilling] = useState<BillingRow[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [drill, setDrill] = useState<DrillSegment | null>(null)

  useEffect(() => {
    if (!selectedProject) {
      setProject(null); setTimesheet([]); setExpenses([]); setVendorCosts([]); setBilling([])
      return
    }
    setLoading(true)
    const supabase = createClient()
    async function load() {
      const [proj, ts, exp, vc, sett] = await Promise.all([
        supabase.from('projects').select('*').eq('id', selectedProject).single(),
        fetchAllRows<TimesheetEntry>('timesheet_entries', selectedProject!, 'entry_date'),
        fetchAllRows<ExpenseEntry>('expense_entries', selectedProject!, 'expense_date'),
        fetchAllRows<VendorCost>('vendor_costs', selectedProject!, 'cost_date'),
        supabase.from('user_settings').select('key, value'),
      ])
      const projRow = proj.data as Project
      setProject(projRow)
      setTimesheet(ts)
      setExpenses(exp)
      setVendorCosts(vc)
      const settMap: Settings = {}
      ;((sett.data ?? []) as { key: string; value: string }[]).forEach(({ key, value }) => { settMap[key] = value ?? undefined })
      setSettings(settMap)

      // Revenue source: billing milestones linked via the master project record
      let billingRows: BillingRow[] = []
      if (projRow?.master_project_id) {
        const { data: master } = await supabase
          .from('master_project').select('billing_sheet_name')
          .eq('id', projRow.master_project_id).single()
        if (master?.billing_sheet_name) {
          const sheetName = master.billing_sheet_name
          const { data: b } = await supabase
            .from('billing_milestones').select('project_name, amount_sgd, billing_milestone, invoice_status')
            .ilike('project_name', `${billingNamePrefixToken(sheetName)}%`)
            .order('source_row')
          billingRows = ((b as BillingRow[]) ?? []).filter(r => billingNameMatches(r.project_name, sheetName))
        }
      }
      setBilling(billingRows)
    }
    load().finally(() => setLoading(false))
  }, [selectedProject])

  // Date-range filter applies to the three direct cost sources
  const inRange = useMemo(() => {
    return (d: string | null | undefined) => {
      if (!dateFrom && !dateTo) return true
      if (!d) return false
      return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)
    }
  }, [dateFrom, dateTo])

  const fTimesheet = useMemo(() => timesheet.filter(e => inRange(e.entry_date)), [timesheet, inRange])
  const fExpenses = useMemo(
    () => expenses.filter(e => e.category?.toLowerCase() !== 'overhead' && inRange(e.expense_date)),
    [expenses, inRange]
  )
  const fVendorCosts = useMemo(() => vendorCosts.filter(e => inRange(e.cost_date)), [vendorCosts, inRange])

  const financials = useMemo(() => {
    const manpowerCost = fTimesheet.reduce((s, e) => s + (e.labour_cost_sgd ?? 0), 0)
    const directExpenses = fExpenses.reduce((s, e) => s + (e.amount_sgd ?? 0), 0)
    const vendorCost = fVendorCosts.reduce((s, e) => s + (e.amount_sgd ?? 0), 0)
    const parsedRate = parseFloat(settings.overhead_rate_pct ?? '')
    const sgaRatePct = isNaN(parsedRate) ? DEFAULT_SGA_RATE_PCT : parsedRate
    // Total Revenue = sum of the project's billing milestones; falls back to
    // the contract value / T&M billable while no billing rows exist yet
    const billingTotal = billing.reduce((s, b) => s + (b.amount_sgd ?? 0), 0)
    const billableValue = fTimesheet.reduce((s, e) => s + (e.billable_value_sgd ?? 0), 0)
    const fallbackRevenue = project?.billing_type === 'T&M' ? billableValue : (project?.contract_value ?? 0)
    const revenue = billingTotal > 0 ? billingTotal : fallbackRevenue
    const revenueFromBilling = billingTotal > 0
    const sga = revenue * (sgaRatePct / 100)
    // Requested formulas: GP = Revenue - SG&A; Total Cost = Manpower + Expenses + Vendor; NP = GP - Total Cost
    const totalCost = manpowerCost + directExpenses + vendorCost
    const grossProfit = revenue - sga
    const netProfit = grossProfit - totalCost
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    return { manpowerCost, directExpenses, vendorCost, sga, sgaRatePct, totalCost, revenue, revenueFromBilling, grossProfit, netProfit, grossMarginPct }
  }, [fTimesheet, fExpenses, fVendorCosts, billing, project, settings])

  const donutData = useMemo(() => {
    const { manpowerCost, directExpenses, vendorCost, sga } = financials
    return [
      { name: 'Manpower Cost' as DrillSegment, value: manpowerCost, color: COST_COLORS.manpower },
      { name: 'Expenses' as DrillSegment, value: directExpenses, color: COST_COLORS.expenses },
      { name: '3rd Party Vendor Cost' as DrillSegment, value: vendorCost, color: COST_COLORS.vendor },
      { name: 'SG&A' as DrillSegment, value: sga, color: COST_COLORS.sga },
    ].filter(d => d.value > 0)
  }, [financials])
  const donutTotal = useMemo(() => donutData.reduce((s, d) => s + d.value, 0), [donutData])

  const consultantData = useMemo(() => {
    const map: Record<string, { name: string; hours: number; cost: number }> = {}
    for (const e of fTimesheet) {
      const key = e.consultant_name ?? 'Unknown'
      if (!map[key]) map[key] = { name: key, hours: 0, cost: 0 }
      map[key].hours += e.hours ?? 0
      map[key].cost += e.labour_cost_sgd ?? 0
    }
    return Object.values(map)
      .sort((a, b) => b.cost - a.cost)
      .map(c => ({ ...c, cost: Math.round(c.cost), hours: Math.round(c.hours * 10) / 10 }))
  }, [fTimesheet])

  const vendorRows = useMemo(
    () => [...fVendorCosts].sort((a, b) => (b.cost_date ?? '').localeCompare(a.cost_date ?? '')),
    [fVendorCosts]
  )
  const expenseRows = useMemo(
    () => [...fExpenses].sort((a, b) => (b.expense_date ?? '').localeCompare(a.expense_date ?? '')),
    [fExpenses]
  )

  if (!selectedProject) return (
    <div className="flex flex-col items-center justify-center h-full text-center py-24">
      <BarChart2 className="w-12 h-12 text-slate-300 mb-4" />
      <h2 className="text-xl font-semibold text-slate-600 mb-2">No project selected</h2>
      <p className="text-slate-400 text-sm">Select a project from the top bar, or go to Projects to create one.</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-full py-24">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
    </div>
  )

  if (timesheet.length === 0 && expenses.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-center py-24">
      <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
      <h2 className="text-xl font-semibold text-slate-600 mb-2">No data yet</h2>
      <p className="text-slate-400 text-sm">Go to Upload Templates to import timesheet and expense data.</p>
    </div>
  )

  const { manpowerCost, directExpenses, vendorCost, sga, sgaRatePct, totalCost, revenue, revenueFromBilling, grossProfit, netProfit, grossMarginPct } = financials
  const pctOfCost = (v: number) => totalCost > 0 ? `${((v / totalCost) * 100).toFixed(1)}% of total cost` : ''
  const pctOfRevenue = (v: number) => revenue > 0 ? `${((v / revenue) * 100).toFixed(1)}% of revenue` : ''
  const hasRange = !!(dateFrom || dateTo)
  const rangeLabel = hasRange
    ? `${dateFrom ? fmtDate(dateFrom) : 'Start'} – ${dateTo ? fmtDate(dateTo) : 'Today'}`
    : 'All time'
  const dateInputCls = 'border border-slate-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700'

  return (
    <div className="space-y-6">
      {/* Project Information */}
      {project && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Project Information</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            <InfoField label="Project Name" value={project.name} />
            <InfoField label="Project Manager" value={project.project_manager || '—'} />
            <InfoField label="Kick Off Date" value={fmtDate(project.start_date)} />
            <InfoField label="Go Live Date" value={fmtDate(project.end_date)} />
            <InfoField label="Billing Type" value={project.billing_type} />
            <InfoField label="Status" value={project.status} valueClass={`capitalize ${STATUS_COLORS[project.status] ?? ''}`} />
            {project.notes && <div className="col-span-2"><InfoField label="Remarks" value={project.notes} /></div>}
          </div>
        </div>
      )}

      {/* Date Range filter — applies to Manpower, Expenses, 3rd Party Vendor (and therefore Total Cost & Net Profit) */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <CalendarRange size={14} className="text-slate-400" /> Date Range
        </span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={dateInputCls} aria-label="From date" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={dateInputCls} aria-label="To date" />
        {hasRange && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 border border-slate-200 rounded-lg px-2 py-1.5 transition-colors"
          >
            <X size={12} /> Clear
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          Costs shown for: <span className="font-medium text-slate-600">{rangeLabel}</span> · Revenue &amp; SG&amp;A are project totals
        </span>
      </div>

      {/* KPI Cards — click any card for the calculation breakdown */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue' as DrillSegment, value: fmt(revenue), sub: revenueFromBilling ? `From billing milestones (${billing.length})` : `${project?.billing_type ?? 'Fixed Fee'} (no billing rows yet)`, icon: DollarSign, subClass: 'bg-teal-50 text-teal-700' },
          { label: 'SG&A' as DrillSegment, value: fmt(sga), sub: `${sgaRatePct}% of revenue`, icon: TrendingDown, subClass: 'text-slate-400' },
          { label: 'Gross Profit' as DrillSegment, value: fmt(grossProfit), sub: pctOfRevenue(grossProfit), icon: TrendingUp, valueClass: grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500', subClass: 'text-slate-400' },
          { label: 'Net Profit' as DrillSegment, value: fmt(netProfit), sub: pctOfRevenue(netProfit), icon: BarChart2, valueClass: marginColor(revenue > 0 ? (netProfit / revenue) * 100 : 0), subClass: 'text-slate-400' },
        ].map(({ label, value, sub, icon: Icon, subClass, valueClass }) => (
          <button key={label} onClick={() => setDrill(label)}
            className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-teal-300 hover:shadow-sm transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
              <Icon size={16} className="text-slate-400" />
            </div>
            <p className={`text-2xl font-bold text-slate-800 ${valueClass ?? ''}`}>{value}</p>
            {sub && <span className={`text-xs mt-1 inline-block px-1.5 py-0.5 rounded ${subClass ?? 'text-slate-400'}`}>{sub}</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Manpower Cost' as DrillSegment, value: manpowerCost, icon: DollarSign },
          { label: 'Expenses' as DrillSegment, value: directExpenses, icon: TrendingDown },
          { label: '3rd Party Vendor Cost' as DrillSegment, value: vendorCost, icon: TrendingUp },
          { label: 'Total Cost' as DrillSegment, value: totalCost, icon: BarChart2 },
        ].map(({ label, value, icon: Icon }) => (
          <button key={label} onClick={() => setDrill(label)}
            className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-teal-300 hover:shadow-sm transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
              <Icon size={16} className="text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{fmt(value)}</p>
            <p className="text-xs text-slate-400 mt-1">{pctOfCost(value)}</p>
            <p className="text-xs text-slate-400">{pctOfRevenue(value)}</p>
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Cost Breakdown</h3>
            <span className="text-xs text-slate-400">Click a segment for details</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={donutData} cx="50%" cy="45%" innerRadius={70} outerRadius={100}
                paddingAngle={3} dataKey="value" labelLine={false}
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                onClick={(d: any) => { const n = d?.name ?? d?.payload?.name; if (n) setDrill(n as DrillSegment) }}
                cursor="pointer"
              >
                {donutData.map(d => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <ReTooltip formatter={(v: any) => fmt(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
            {donutData.map(d => (
              <button
                key={d.name}
                onClick={() => setDrill(d.name)}
                className="flex items-center gap-1.5 text-left hover:bg-slate-50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span>{d.name}: <span className="font-medium text-slate-800">{fmt(d.value)}</span> ({donutTotal > 0 ? ((d.value / donutTotal) * 100).toFixed(1) : '0.0'}%)</span>
              </button>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">Total Cost</p>
              <p className="text-sm font-bold text-slate-800">{fmt(totalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">Gross Profit</p>
              <p className={`text-sm font-bold ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(grossProfit)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">Gross Margin</p>
              <p className={`text-sm font-bold ${marginColor(grossMarginPct)}`}>{fmtPct(grossMarginPct)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Manpower Cost</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={consultantData} margin={{ top: 4, right: 8, bottom: 70, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} height={80} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `S$${(v / 1000).toFixed(0)}k`} />
              <Bar dataKey="cost" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Segment drill-down */}
      <Modal open={!!drill} title={drill ?? ''} onClose={() => setDrill(null)} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <p className="text-xs text-slate-400">Period: {rangeLabel}</p>

          {drill === 'Manpower Cost' && (
            <>
              <p className="text-xs text-slate-500">Hours per consultant. Rates and cost amounts are not shown here.</p>
              <div className="max-h-80 overflow-y-auto border border-slate-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-xs text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-medium">Consultant</th>
                      <th className="text-right px-3 py-2 font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {consultantData.map(c => (
                      <tr key={c.name}>
                        <td className="px-3 py-2 text-slate-700">{c.name}</td>
                        <td className="px-3 py-2 text-right text-slate-800 font-medium">{c.hours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr className="font-semibold text-slate-800">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{consultantData.reduce((s, c) => s + c.hours, 0).toFixed(1)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {drill === 'Expenses' && (
            <div className="max-h-80 overflow-y-auto border border-slate-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Category</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenseRows.map(e => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 text-slate-500 text-xs">{fmtDate(e.expense_date)}</td>
                      <td className="px-3 py-2 text-slate-700">{e.category || '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-800 font-medium">{fmt(e.amount_sgd ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr className="font-semibold text-slate-800">
                    <td className="px-3 py-2" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-right">{fmt(directExpenses)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {drill === '3rd Party Vendor Cost' && (
            <div className="max-h-80 overflow-y-auto border border-slate-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Vendor</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendorRows.map(v => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 text-slate-500 text-xs">{fmtDate(v.cost_date)}</td>
                      <td className="px-3 py-2 text-slate-700">{v.vendor_name || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{v.description || '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-800 font-medium">{fmt(v.amount_sgd ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr className="font-semibold text-slate-800">
                    <td className="px-3 py-2" colSpan={3}>Total</td>
                    <td className="px-3 py-2 text-right">{fmt(vendorCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {drill === 'SG&A' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">SG&amp;A is deducted directly from revenue at the configured rate (Settings → SG&amp;A). It is not affected by the date range.</p>
              <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 text-sm">
                <CalcRow label="Total Revenue" value={fmt(revenue)} />
                <CalcRow label="SG&A Rate" value={`${sgaRatePct}%`} />
                <CalcRow label={`SG&A = ${fmt(revenue)} × ${sgaRatePct}%`} value={fmt(sga)} bold />
              </div>
            </div>
          )}

          {drill === 'Total Revenue' && (
            <div className="space-y-3">
              {revenueFromBilling ? (
                <>
                  <p className="text-xs text-slate-500">Sum of the project&apos;s billing milestones (Billing page).</p>
                  <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr className="text-xs text-slate-500 uppercase tracking-wide">
                          <th className="text-left px-3 py-2 font-medium">Milestone</th>
                          <th className="text-left px-3 py-2 font-medium">Invoice Status</th>
                          <th className="text-right px-3 py-2 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {billing.map((b, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-700">{b.billing_milestone || '—'}</td>
                            <td className="px-3 py-2 text-slate-500 text-xs">{b.invoice_status || '—'}</td>
                            <td className="px-3 py-2 text-right text-slate-800 font-medium">{fmt(b.amount_sgd ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50">
                        <tr className="font-semibold text-slate-800">
                          <td className="px-3 py-2" colSpan={2}>Total Revenue</td>
                          <td className="px-3 py-2 text-right">{fmt(revenue)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500">No billing milestones found for this project yet — showing the fallback source.</p>
                  <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 text-sm">
                    <CalcRow label={project?.billing_type === 'T&M' ? 'Billable value (timesheets)' : 'Contract value'} value={fmt(revenue)} />
                    <CalcRow label="Total Revenue" value={fmt(revenue)} bold />
                  </div>
                </>
              )}
            </div>
          )}

          {drill === 'Gross Profit' && (
            <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 text-sm">
              <CalcRow label="Total Revenue" value={fmt(revenue)} />
              <CalcRow label={`SG&A (${sgaRatePct}% of revenue)`} value={`− ${fmt(sga)}`} />
              <CalcRow label="Gross Profit = Revenue − SG&A" value={fmt(grossProfit)} bold />
              <CalcRow label="Gross Margin (of revenue)" value={fmtPct(grossMarginPct)} />
            </div>
          )}

          {drill === 'Net Profit' && (
            <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 text-sm">
              <CalcRow label="Total Revenue" value={fmt(revenue)} />
              <CalcRow label={`SG&A (${sgaRatePct}% of revenue)`} value={`− ${fmt(sga)}`} />
              <CalcRow label="Gross Profit" value={fmt(grossProfit)} bold />
              <CalcRow label="Manpower Cost" value={`− ${fmt(manpowerCost)}`} />
              <CalcRow label="Expenses" value={`− ${fmt(directExpenses)}`} />
              <CalcRow label="3rd Party Vendor Cost" value={`− ${fmt(vendorCost)}`} />
              <CalcRow label="Net Profit = Gross Profit − Total Cost" value={fmt(netProfit)} bold />
              <CalcRow label="Net Margin (of revenue)" value={revenue > 0 ? fmtPct((netProfit / revenue) * 100) : '—'} />
            </div>
          )}

          {drill === 'Total Cost' && (
            <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 text-sm">
              <CalcRow label="Manpower Cost" value={fmt(manpowerCost)} />
              <CalcRow label="Expenses" value={fmt(directExpenses)} />
              <CalcRow label="3rd Party Vendor Cost" value={fmt(vendorCost)} />
              <CalcRow label="Total Cost = Manpower + Expenses + Vendor" value={fmt(totalCost)} bold />
              <CalcRow label="SG&A is not included in Total Cost" value={fmt(sga)} />
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
