'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, BarChart2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/fetchAll'
import { useProject } from '@/contexts/ProjectContext'

interface Project {
  id: string; name: string; contract_value: number
  contract_currency: string; billing_type: string
  project_manager: string | null; start_date: string | null; end_date: string | null
  status: string; notes: string | null
}
interface TimesheetEntry {
  id: number; consultant_name: string; phase: string; hours: number
  cost_rate_sgd: number; labour_cost_sgd: number; bill_rate_sgd: number; billable_value_sgd: number
}
interface ExpenseEntry { id: number; category: string; amount_sgd: number }
interface VendorCost { id: number; amount_sgd: number }
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
const COST_COLORS = { manpower: '#0d9488', expenses: '#3b82f6', vendor: '#8b5cf6', sga: '#f59e0b' }

export default function DashboardPage() {
  const { selectedProject } = useProject()
  const [project, setProject] = useState<Project | null>(null)
  const [timesheet, setTimesheet] = useState<TimesheetEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [vendorCosts, setVendorCosts] = useState<VendorCost[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedProject) { setProject(null); setTimesheet([]); setExpenses([]); setVendorCosts([]); return }
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      supabase.from('projects').select('*').eq('id', selectedProject).single(),
      fetchAllRows<TimesheetEntry>('timesheet_entries', selectedProject, 'entry_date'),
      fetchAllRows<ExpenseEntry>('expense_entries', selectedProject, 'expense_date'),
      fetchAllRows<VendorCost>('vendor_costs', selectedProject, 'cost_date'),
      supabase.from('user_settings').select('key, value'),
    ]).then(([proj, ts, exp, vc, sett]) => {
      setProject(proj.data as Project)
      setTimesheet(ts)
      setExpenses(exp)
      setVendorCosts(vc)
      const settMap: Settings = {}
      ;((sett.data ?? []) as { key: string; value: string }[]).forEach(({ key, value }) => { settMap[key] = value ?? undefined })
      setSettings(settMap)
    }).finally(() => setLoading(false))
  }, [selectedProject])

  const financials = useMemo(() => {
    const manpowerCost = timesheet.reduce((s, e) => s + (e.labour_cost_sgd ?? 0), 0)
    const directExpenses = expenses.filter(e => e.category?.toLowerCase() !== 'overhead').reduce((s, e) => s + (e.amount_sgd ?? 0), 0)
    const vendorCost = vendorCosts.reduce((s, e) => s + (e.amount_sgd ?? 0), 0)
    const parsedRate = parseFloat(settings.overhead_rate_pct ?? '')
    const sgaRatePct = isNaN(parsedRate) ? DEFAULT_SGA_RATE_PCT : parsedRate
    const billableValue = timesheet.reduce((s, e) => s + (e.billable_value_sgd ?? 0), 0)
    const revenue = project?.billing_type === 'T&M' ? billableValue : (project?.contract_value ?? 0)
    const sga = revenue * (sgaRatePct / 100)
    const directCost = manpowerCost + directExpenses + vendorCost
    const totalCost = directCost + sga
    const grossProfit = revenue - directCost
    const netProfit = grossProfit - sga
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    return { manpowerCost, directExpenses, vendorCost, sga, sgaRatePct, directCost, totalCost, revenue, grossProfit, netProfit, grossMarginPct }
  }, [timesheet, expenses, vendorCosts, project, settings])

  const donutData = useMemo(() => {
    const { manpowerCost, directExpenses, vendorCost, sga } = financials
    return [
      { name: 'Manpower Cost', value: manpowerCost, color: COST_COLORS.manpower },
      { name: 'Expenses', value: directExpenses, color: COST_COLORS.expenses },
      { name: '3rd Party Vendor Cost', value: vendorCost, color: COST_COLORS.vendor },
      { name: 'SG&A', value: sga, color: COST_COLORS.sga },
    ].filter(d => d.value > 0)
  }, [financials])

  const consultantData = useMemo(() => {
    const map: Record<string, { name: string; hours: number; cost: number }> = {}
    for (const e of timesheet) {
      const key = e.consultant_name ?? 'Unknown'
      if (!map[key]) map[key] = { name: key, hours: 0, cost: 0 }
      map[key].hours += e.hours ?? 0
      map[key].cost += e.labour_cost_sgd ?? 0
    }
    return Object.values(map)
      .sort((a, b) => b.cost - a.cost)
      .map(c => ({ ...c, cost: Math.round(c.cost) }))
  }, [timesheet])

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

  const { manpowerCost, directExpenses, vendorCost, sga, sgaRatePct, totalCost, revenue, grossProfit, netProfit, grossMarginPct } = financials
  const pctOfCost = (v: number) => totalCost > 0 ? `${((v / totalCost) * 100).toFixed(1)}% of total cost` : ''
  const pctOfRevenue = (v: number) => revenue > 0 ? `${((v / revenue) * 100).toFixed(1)}% of revenue` : ''

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

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: fmt(revenue), sub: project?.billing_type ?? 'Fixed Fee', icon: DollarSign, subClass: 'bg-teal-50 text-teal-700' },
          { label: 'SG&A', value: fmt(sga), sub: `${sgaRatePct}% of revenue`, icon: TrendingDown, subClass: 'text-slate-400' },
          { label: 'Gross Profit', value: fmt(grossProfit), sub: pctOfRevenue(grossProfit), icon: TrendingUp, valueClass: grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500', subClass: 'text-slate-400' },
          { label: 'Net Profit', value: fmt(netProfit), sub: pctOfRevenue(netProfit), icon: BarChart2, valueClass: marginColor(revenue > 0 ? (netProfit / revenue) * 100 : 0), subClass: 'text-slate-400' },
        ].map(({ label, value, sub, icon: Icon, subClass, valueClass }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
              <Icon size={16} className="text-slate-400" />
            </div>
            <p className={`text-2xl font-bold text-slate-800 ${valueClass ?? ''}`}>{value}</p>
            {sub && <span className={`text-xs mt-1 inline-block px-1.5 py-0.5 rounded ${subClass ?? 'text-slate-400'}`}>{sub}</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Manpower Cost', value: manpowerCost, icon: DollarSign },
          { label: 'Expenses', value: directExpenses, icon: TrendingDown },
          { label: '3rd Party Vendor Cost', value: vendorCost, icon: TrendingUp },
          { label: 'Total Cost', value: totalCost, icon: BarChart2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
              <Icon size={16} className="text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{fmt(value)}</p>
            <p className="text-xs text-slate-400 mt-1">{pctOfCost(value)}</p>
            <p className="text-xs text-slate-400">{pctOfRevenue(value)}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Cost Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={donutData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={3} dataKey="value" labelLine={false}>
                {donutData.map(d => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <ReTooltip formatter={(v: any) => fmt(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
            {donutData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span>{d.name}: <span className="font-medium text-slate-800">{fmt(d.value)}</span> ({totalCost > 0 ? ((d.value / totalCost) * 100).toFixed(1) : '0.0'}%)</span>
              </div>
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
              <Bar dataKey="cost" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}
