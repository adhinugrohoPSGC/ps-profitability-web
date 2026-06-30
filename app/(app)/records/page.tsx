'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import { ClipboardList, DollarSign, Clock, TrendingUp, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useToast } from '@/components/Toast'

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const { selectedProject } = useProject()
  const { toast } = useToast()
  const [tab, setTab] = useState<'timesheet' | 'expenses'>('timesheet')
  const [timesheet, setTimesheet] = useState<TimesheetEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [batchFilter, setBatchFilter] = useState('')
  const [showAllTs, setShowAllTs] = useState(false)
  const [showAllEx, setShowAllEx] = useState(false)

  useEffect(() => {
    if (!selectedProject) { setTimesheet([]); setExpenses([]); return }
    setLoading(true)
    Promise.all([
      createClient().from('timesheet_entries').select('*').eq('project_id', selectedProject).order('entry_date', { ascending: false }),
      createClient().from('expense_entries').select('*').eq('project_id', selectedProject).order('expense_date', { ascending: false }),
    ]).then(([ts, ex]) => {
      setTimesheet((ts.data ?? []) as TimesheetEntry[])
      setExpenses((ex.data ?? []) as ExpenseEntry[])
    }).finally(() => setLoading(false))
  }, [selectedProject])

  // Batch options
  const tsBatches = useMemo(() => [...new Set(timesheet.map(r => r.import_batch_id).filter(Boolean))], [timesheet])
  const exBatches = useMemo(() => [...new Set(expenses.map(r => r.import_batch_id).filter(Boolean))], [expenses])

  const filteredTs = useMemo(() =>
    batchFilter ? timesheet.filter(r => r.import_batch_id === batchFilter) : timesheet,
    [timesheet, batchFilter])

  const filteredEx = useMemo(() =>
    batchFilter ? expenses.filter(r => r.import_batch_id === batchFilter) : expenses,
    [expenses, batchFilter])

  // KPIs
  const totalHours = filteredTs.reduce((s, r) => s + (r.hours ?? 0), 0)
  const totalCost = filteredTs.reduce((s, r) => s + (r.labour_cost_sgd ?? 0), 0)
  const totalBill = filteredTs.reduce((s, r) => s + (r.billable_value_sgd ?? 0), 0)
  const totalExpSgd = filteredEx.reduce((s, r) => s + (r.amount_sgd ?? 0), 0)

  const displayTs = showAllTs ? filteredTs : filteredTs.slice(0, 50)
  const displayEx = showAllEx ? filteredEx : filteredEx.slice(0, 50)

  async function deleteTimesheetRow(id: number) {
    const { error } = await createClient().from('timesheet_entries').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setTimesheet(prev => prev.filter(r => r.id !== id))
    toast('Row deleted', 'success')
  }

  async function deleteExpenseRow(id: number) {
    const { error } = await createClient().from('expense_entries').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setExpenses(prev => prev.filter(r => r.id !== id))
    toast('Row deleted', 'success')
  }

  async function deleteBatch(batchId: string, type: 'timesheet' | 'expenses') {
    if (!confirm(`Delete all rows for batch "${batchId}"?`)) return
    if (type === 'timesheet') {
      const { error } = await createClient().from('timesheet_entries').delete().eq('import_batch_id', batchId).eq('project_id', selectedProject!)
      if (error) { toast(error.message, 'error'); return }
      setTimesheet(prev => prev.filter(r => r.import_batch_id !== batchId))
    } else {
      const { error } = await createClient().from('expense_entries').delete().eq('import_batch_id', batchId).eq('project_id', selectedProject!)
      if (error) { toast(error.message, 'error'); return }
      setExpenses(prev => prev.filter(r => r.import_batch_id !== batchId))
    }
    if (batchFilter === batchId) setBatchFilter('')
    toast('Batch deleted', 'success')
  }

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
        {/* Batch filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Filter batch:</label>
          <select
            value={batchFilter}
            onChange={e => setBatchFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">All batches</option>
            {(tab === 'timesheet' ? tsBatches : exBatches).map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          {batchFilter && (
            <button
              onClick={() => deleteBatch(batchFilter, tab)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={12} /> Delete batch
            </button>
          )}
        </div>
      </div>

      {/* KPI row */}
      {tab === 'timesheet' ? (
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total Hours" value={totalHours.toFixed(1) + ' h'} sub={`${filteredTs.length} entries`} />
          <KpiCard label="Labour Cost" value={fmt(totalCost)} />
          <KpiCard label="Billable Value" value={fmt(totalBill)} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total Expenses (SGD)" value={fmt(totalExpSgd)} sub={`${filteredEx.length} entries`} />
          <KpiCard label="Receipted" value={filteredEx.filter(r => r.receipted).length + ' / ' + filteredEx.length} />
          <KpiCard label="Categories" value={String(new Set(filteredEx.map(r => r.category)).size)} />
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => { setTab('timesheet'); setBatchFilter('') }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${tab === 'timesheet' ? 'border-b-2 border-teal-500 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Clock size={14} /> Timesheet
            <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{timesheet.length}</span>
          </button>
          <button
            onClick={() => { setTab('expenses'); setBatchFilter('') }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${tab === 'expenses' ? 'border-b-2 border-teal-500 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <DollarSign size={14} /> Expenses
            <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{expenses.length}</span>
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : tab === 'timesheet' ? (
          <>
            {filteredTs.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">No timesheet entries found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <tr>
                      {['Date', 'Consultant', 'Phase', 'Task', 'Hrs', 'Cost Rate', 'Labour Cost', 'Bill Rate', 'Bill Value', 'Batch', ''].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-medium whitespace-nowrap last:w-8">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayTs.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.entry_date}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{row.consultant_name || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500">{row.phase || '—'}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate text-slate-500" title={row.task_description}>{row.task_description || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">{row.hours?.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">{row.cost_rate_sgd > 0 ? fmt(row.cost_rate_sgd) : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700 font-medium">{row.labour_cost_sgd > 0 ? fmt(row.labour_cost_sgd) : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">{row.bill_rate_sgd > 0 ? fmt(row.bill_rate_sgd) : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-teal-700 font-medium">{row.billable_value_sgd > 0 ? fmt(row.billable_value_sgd) : '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-400 max-w-[100px] truncate" title={row.import_batch_id}>{row.import_batch_id || '—'}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => deleteTimesheetRow(row.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredTs.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-semibold text-slate-700">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-slate-500">Totals</td>
                        <td className="px-3 py-2 text-right font-mono">{totalHours.toFixed(1)}</td>
                        <td />
                        <td className="px-3 py-2 text-right font-mono">{fmt(totalCost)}</td>
                        <td />
                        <td className="px-3 py-2 text-right font-mono text-teal-700">{fmt(totalBill)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {filteredTs.length > 50 && (
              <div className="px-4 py-3 border-t border-slate-100">
                <button onClick={() => setShowAllTs(v => !v)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  {showAllTs ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {filteredTs.length} rows</>}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {filteredEx.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">No expense entries found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <tr>
                      {['Date', 'Category', 'Description', 'Vendor', 'Amount', 'CCY', 'SGD', 'Paid By', 'Rcpt', 'Batch', ''].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-medium whitespace-nowrap last:w-8">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayEx.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.expense_date}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium">{row.category || '—'}</span>
                        </td>
                        <td className="px-3 py-2 max-w-[160px] truncate text-slate-500" title={row.description}>{row.description || '—'}</td>
                        <td className="px-3 py-2 max-w-[120px] truncate text-slate-500" title={row.vendor}>{row.vendor || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">{row.amount_native?.toLocaleString()}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">{row.currency}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-800 font-medium">{fmt(row.amount_sgd)}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.paid_by || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          {row.receipted
                            ? <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
                            : <span className="inline-block w-2 h-2 rounded-full bg-slate-200" />}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400 max-w-[100px] truncate" title={row.import_batch_id}>{row.import_batch_id || '—'}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => deleteExpenseRow(row.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredEx.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-semibold text-slate-700">
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-right text-slate-500">Total (SGD)</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(totalExpSgd)}</td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {filteredEx.length > 50 && (
              <div className="px-4 py-3 border-t border-slate-100">
                <button onClick={() => setShowAllEx(v => !v)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  {showAllEx ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {filteredEx.length} rows</>}
                </button>
              </div>
            )}
          </>
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
