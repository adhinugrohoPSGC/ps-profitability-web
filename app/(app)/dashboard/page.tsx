'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, BarChart2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'

interface Project {
  id: string; name: string; client_name: string; contract_value: number
  contract_currency: string; billing_type: string; overhead_rate_pct: number
}
interface TimesheetEntry {
  id: number; consultant_name: string; phase: string; hours: number
  cost_rate_sgd: number; labour_cost_sgd: number; bill_rate_sgd: number; billable_value_sgd: number
}
interface ExpenseEntry { id: number; category: string; amount_sgd: number }
interface BudgetLine { id: number; phase: string; budgeted_hours: number; budgeted_cost: number; budgeted_revenue: number }
interface Settings { overhead_rate_pct?: string; overhead_method?: string; [key: string]: string | undefined }

const fmt = (v: number) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(v)
const fmtPct = (v: number) => `${v.toFixed(1)}%`
function marginColor(pct: number) { return pct >= 30 ? 'text-emerald-600' : pct >= 15 ? 'text-amber-500' : 'text-red-500' }
function variancePctColor(pct: number) { return pct <= 0 ? 'bg-emerald-50 text-emerald-700' : pct <= 25 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700' }
const DONUT_COLORS = ['#0d9488', '#3b82f6', '#f59e0b']

export default function DashboardPage() {
  const { selectedProject } = useProject()
  const [project, setProject] = useState<Project | null>(null)
  const [timesheet, setTimesheet] = useState<TimesheetEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [budget, setBudget] = useState<BudgetLine[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedProject) { setProject(null); setTimesheet([]); setExpenses([]); setBudget([]); return }
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      supabase.from('projects').select('*').eq('id', selectedProject).single(),
      supabase.from('timesheet_entries').select('*').eq('project_id', selectedProject),
      supabase.from('expense_entries').select('*').eq('project_id', selectedProject),
      supabase.from('project_budget').select('*').eq('project_id', selectedProject),
      supabase.from('user_settings').select('key, value'),
    ]).then(([proj, ts, exp, bud, sett]) => {
      setProject(proj.data as Project)
      setTimesheet((ts.data as TimesheetEntry[]) ?? [])
      setExpenses((exp.data as ExpenseEntry[]) ?? [])
      setBudget((bud.data as BudgetLine[]) ?? [])
      const settMap: Settings = {}
      ;((sett.data ?? []) as { key: string; value: string }[]).forEach(({ key, value }) => { settMap[key] = value ?? undefined })
      setSettings(settMap)
    }).finally(() => setLoading(false))
  }, [selectedProject])

  const financials = useMemo(() => {
    const labourCost = timesheet.reduce((s, e) => s + (e.labour_cost_sgd ?? 0), 0)
    const directExpenses = expenses.filter(e => e.category?.toLowerCase() !== 'overhead').reduce((s, e) => s + (e.amount_sgd ?? 0), 0)
    const overheadLogged = expenses.filter(e => e.category?.toLowerCase() === 'overhead').reduce((s, e) => s + (e.amount_sgd ?? 0), 0)
    const overheadRatePct = project?.overhead_rate_pct ?? parseFloat(settings.overhead_rate_pct ?? '0')
    const overhead = Math.max(overheadLogged, labourCost * (overheadRatePct / 100))
    const totalCost = labourCost + directExpenses + overhead
    const billableValue = timesheet.reduce((s, e) => s + (e.billable_value_sgd ?? 0), 0)
    const revenue = project?.billing_type === 'T&M' ? billableValue : (project?.contract_value ?? 0)
    const grossProfit = revenue - totalCost
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    return { labourCost, directExpenses, overhead, totalCost, revenue, grossProfit, grossMarginPct }
  }, [timesheet, expenses, project, settings])

  const donutData = useMemo(() => {
    const { labourCost, directExpenses, overhead } = financials
    return [
      { name: 'Labour Cost', value: labourCost },
      { name: 'Direct Expenses', value: directExpenses },
      { name: 'Overhead', value: overhead },
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
      .map(c => ({ ...c, shortName: c.name.split(' ').slice(-1)[0], cost: Math.round(c.cost) }))
  }, [timesheet])

  const budgetRows = useMemo(() => {
    const actualMap: Record<string, { hours: number; cost: number }> = {}
    for (const e of timesheet) {
      const ph = e.phase ?? 'Unassigned'
      if (!actualMap[ph]) actualMap[ph] = { hours: 0, cost: 0 }
      actualMap[ph].hours += e.hours ?? 0
      actualMap[ph].cost += e.labour_cost_sgd ?? 0
    }
    const allPhases = new Set([...budget.map(b => b.phase), ...Object.keys(actualMap)])
    return [...allPhases].map(phase => {
      const bud = budget.find(b => b.phase === phase)
      const act = actualMap[phase] ?? { hours: 0, cost: 0 }
      const hrsVariance = act.hours - (bud?.budgeted_hours ?? 0)
      const costVariance = act.cost - (bud?.budgeted_cost ?? 0)
      const variancePct = (bud?.budgeted_cost ?? 0) > 0 ? (costVariance / bud!.budgeted_cost) * 100 : 0
      return { phase, budgetedHours: bud?.budgeted_hours ?? 0, actualHours: act.hours, hrsVariance, budgetedCost: bud?.budgeted_cost ?? 0, actualCost: act.cost, costVariance, variancePct }
    })
  }, [budget, timesheet])

  const budgetTotals = useMemo(() => budgetRows.reduce(
    (acc, r) => ({
      budgetedHours: acc.budgetedHours + r.budgetedHours,
      actualHours: acc.actualHours + r.actualHours,
      hrsVariance: acc.hrsVariance + r.hrsVariance,
      budgetedCost: acc.budgetedCost + r.budgetedCost,
      actualCost: acc.actualCost + r.actualCost,
      costVariance: acc.costVariance + r.costVariance,
    }),
    { budgetedHours: 0, actualHours: 0, hrsVariance: 0, budgetedCost: 0, actualCost: 0, costVariance: 0 }
  ), [budgetRows])

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

  const { labourCost, directExpenses, overhead, totalCost, revenue, grossProfit, grossMarginPct } = financials

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: fmt(revenue), sub: project?.billing_type ?? 'Fixed Fee', icon: DollarSign, subClass: 'bg-teal-50 text-teal-700' },
          { label: 'Total Cost', value: fmt(totalCost), sub: 'Labour + Expenses + Overhead', icon: TrendingDown, subClass: 'text-slate-400' },
          { label: 'Gross Profit', value: fmt(grossProfit), sub: '', icon: TrendingUp, valueClass: grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500' },
          { label: 'Gross Margin', value: fmtPct(grossMarginPct), sub: grossMarginPct >= 30 ? 'Healthy' : grossMarginPct >= 15 ? 'Acceptable' : 'Below target', icon: BarChart2, valueClass: marginColor(grossMarginPct) },
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

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Cost Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={donutData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={3} dataKey="value" labelLine={false}>
                {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
              </Pie>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <ReTooltip formatter={(v: any) => fmt(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
            {[['bg-teal-600', 'Labour', labourCost], ['bg-blue-500', 'Expenses', directExpenses], ['bg-amber-500', 'Overhead', overhead]].map(([bg, lbl, val]) => (
              <div key={String(lbl)} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${bg} inline-block`} />
                <span>{lbl} {fmt(Number(val))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Labour Cost by Consultant</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={consultantData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="shortName" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `S$${(v / 1000).toFixed(0)}k`} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <ReTooltip
                formatter={(v: any, _n: any, p: any) => [`${fmt(Number(v))} (${(p?.payload?.hours ?? 0).toFixed(1)} hrs)`, 'Labour Cost']}
                labelFormatter={(l: any) => consultantData.find(c => c.shortName === String(l))?.name ?? String(l)}
              />
              <Bar dataKey="cost" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Budget vs Actual */}
      {budgetRows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Budget vs Actual</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                  {['Phase', 'Budg. Hrs', 'Act. Hrs', 'Hrs Var', 'Budg. Cost', 'Act. Cost', 'Cost Var', 'Var %'].map(h => (
                    <th key={h} className={`py-2 ${h === 'Phase' ? 'text-left pr-4' : 'text-right px-2'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {budgetRows.map(row => (
                  <tr key={row.phase} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-700">{row.phase}</td>
                    <td className="text-right py-2 px-2 text-slate-600">{row.budgetedHours.toFixed(1)}</td>
                    <td className="text-right py-2 px-2 text-slate-600">{row.actualHours.toFixed(1)}</td>
                    <td className={`text-right py-2 px-2 ${row.hrsVariance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{row.hrsVariance > 0 ? '+' : ''}{row.hrsVariance.toFixed(1)}</td>
                    <td className="text-right py-2 px-2 text-slate-600">{fmt(row.budgetedCost)}</td>
                    <td className="text-right py-2 px-2 text-slate-600">{fmt(row.actualCost)}</td>
                    <td className={`text-right py-2 px-2 ${row.costVariance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{row.costVariance > 0 ? '+' : ''}{fmt(row.costVariance)}</td>
                    <td className="text-right py-2 pl-2">
                      {row.budgetedCost > 0
                        ? <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${variancePctColor(row.variancePct)}`}>{row.variancePct > 0 ? '+' : ''}{fmtPct(row.variancePct)}</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-bold text-slate-800">
                  <td className="py-2 pr-4">Total</td>
                  <td className="text-right py-2 px-2">{budgetTotals.budgetedHours.toFixed(1)}</td>
                  <td className="text-right py-2 px-2">{budgetTotals.actualHours.toFixed(1)}</td>
                  <td className={`text-right py-2 px-2 ${budgetTotals.hrsVariance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{budgetTotals.hrsVariance > 0 ? '+' : ''}{budgetTotals.hrsVariance.toFixed(1)}</td>
                  <td className="text-right py-2 px-2">{fmt(budgetTotals.budgetedCost)}</td>
                  <td className="text-right py-2 px-2">{fmt(budgetTotals.actualCost)}</td>
                  <td className={`text-right py-2 px-2 ${budgetTotals.costVariance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{budgetTotals.costVariance > 0 ? '+' : ''}{fmt(budgetTotals.costVariance)}</td>
                  <td className="text-right py-2 pl-2">
                    {budgetTotals.budgetedCost > 0
                      ? <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${variancePctColor((budgetTotals.costVariance / budgetTotals.budgetedCost) * 100)}`}>
                          {((budgetTotals.costVariance / budgetTotals.budgetedCost) * 100) > 0 ? '+' : ''}{fmtPct((budgetTotals.costVariance / budgetTotals.budgetedCost) * 100)}
                        </span>
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
