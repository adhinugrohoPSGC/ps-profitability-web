'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Plus, Search, Loader2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import { parseCsmMonitoringXLS } from '@/lib/parseTemplates'

type Row = Record<string, unknown> & { id: string | number }

type Col = {
  key: string
  label: string
  editable?: boolean
  kind?: 'text' | 'number' | 'bool' | 'array' | 'timestamp'
  width?: string
}

type TabDef = {
  key: string
  label: string
  table: string
  orderBy: string
  hasActive: boolean
  canAdd: boolean
  cols: Col[]
  addDefaults?: Record<string, unknown>
}

const TABS: TabDef[] = [
  {
    key: 'people', label: 'People', table: 'master_person', orderBy: 'canonical_name', hasActive: true, canAdd: true,
    addDefaults: { canonical_name: 'New person', active: true },
    cols: [
      { key: 'canonical_name', label: 'Canonical Name', editable: true, width: 'min-w-[180px]' },
      { key: 'email', label: 'Email', editable: true, width: 'min-w-[160px]' },
      { key: 'position_code', label: 'Position', editable: true },
      { key: 'designation', label: 'Designation', editable: true },
      { key: 'tier', label: 'Tier', editable: true },
      { key: 'country', label: 'Country', editable: true },
      { key: 'manager_name', label: 'Manager', editable: true },
      { key: 'employment_status', label: 'Employment', editable: true },
      { key: 'aliases', label: 'Aliases', kind: 'array' },
    ],
  },
  {
    key: 'projects', label: 'Projects', table: 'master_project', orderBy: 'canonical_name', hasActive: true, canAdd: true,
    addDefaults: { canonical_name: 'New project', active: true },
    cols: [
      { key: 'project_code', label: 'Code', editable: true },
      { key: 'canonical_name', label: 'Canonical Name', editable: true, width: 'min-w-[240px]' },
      { key: 'region', label: 'Region', editable: true },
      { key: 'product', label: 'Product', editable: true },
      { key: 'status', label: 'Status', editable: true },
      { key: 'clickup_list_name', label: 'ClickUp List', editable: true, width: 'min-w-[160px]' },
      { key: 'billing_sheet_name', label: 'Billing Sheet', editable: true, width: 'min-w-[160px]' },
      { key: 'profitability_name', label: 'Profitability', editable: true, width: 'min-w-[160px]' },
      { key: 'aliases', label: 'Aliases', kind: 'array' },
    ],
  },
  {
    key: 'clients', label: 'Clients', table: 'master_client', orderBy: 'name', hasActive: true, canAdd: true,
    addDefaults: { name: 'New client', active: true },
    cols: [
      { key: 'name', label: 'Name', editable: true, width: 'min-w-[200px]' },
      { key: 'country', label: 'Country', editable: true },
      { key: 'industry', label: 'Industry', editable: true },
      { key: 'aliases', label: 'Aliases', kind: 'array' },
    ],
  },
  {
    key: 'modules', label: 'Modules', table: 'master_module', orderBy: 'module_name', hasActive: true, canAdd: true,
    addDefaults: { module_name: 'New module', active: true },
    cols: [
      { key: 'product', label: 'Product', editable: true },
      { key: 'module_name', label: 'Module', editable: true, width: 'min-w-[200px]' },
      { key: 'category', label: 'Category', editable: true },
      { key: 'default_fc_mandays', label: 'FC Mandays', editable: true, kind: 'number' },
      { key: 'default_tc_mandays', label: 'TC Mandays', editable: true, kind: 'number' },
      { key: 'in_cpq', label: 'In CPQ', kind: 'bool' },
      { key: 'in_skill_matrix', label: 'In Skill Matrix', kind: 'bool' },
    ],
  },
  {
    key: 'positions', label: 'Positions', table: 'master_position', orderBy: 'sort_order', hasActive: true, canAdd: true,
    addDefaults: { code: 'NEW', name: 'New position', sort_order: 999, active: true },
    cols: [
      { key: 'code', label: 'Code', editable: true },
      { key: 'name', label: 'Name', editable: true, width: 'min-w-[180px]' },
      { key: 'subteam', label: 'Subteam', editable: true },
      { key: 'revenue_stream', label: 'Revenue Stream', editable: true },
      { key: 'sort_order', label: 'Sort', editable: true, kind: 'number' },
    ],
  },
  {
    key: 'reflists', label: 'Reference Lists', table: 'ref_list', orderBy: 'list_key', hasActive: true, canAdd: true,
    addDefaults: { list_key: 'new_list', value: 'New value', sort_order: 999, active: true },
    cols: [
      { key: 'list_key', label: 'List Key', editable: true },
      { key: 'value', label: 'Value', editable: true, width: 'min-w-[220px]' },
      { key: 'sort_order', label: 'Sort', editable: true, kind: 'number' },
    ],
  },
  {
    key: 'csm', label: 'CSM Contracts', table: 'csm_projects', orderBy: 'project_name', hasActive: false, canAdd: true,
    addDefaults: { project_name: 'New contract' },
    cols: [
      { key: 'project_name', label: 'Project Name', editable: true, width: 'min-w-[240px]' },
      { key: 'team', label: 'Team', editable: true },
      { key: 'assignee', label: 'Assignee', editable: true, width: 'min-w-[160px]' },
      { key: 'contract_type', label: 'Contract Type', editable: true },
      { key: 'status', label: 'Status', editable: true },
      { key: 'customer_health', label: 'Customer Health', editable: true },
      { key: 'country', label: 'Country', editable: true },
      { key: 'start_date', label: 'Start Date', kind: 'timestamp' },
      { key: 'contract_end_date', label: 'Contract End', kind: 'timestamp' },
      { key: 'transition_date', label: 'Transition', kind: 'timestamp' },
      { key: 'extended_expiry_date', label: 'Extended Expiry', kind: 'timestamp' },
      { key: 'total_contracted_hours', label: 'Contracted Hrs', editable: true, kind: 'number' },
      { key: 'total_billed_hours', label: 'Billed Hrs', editable: true, kind: 'number' },
      { key: 'remaining_hours', label: 'Remaining Hrs', editable: true, kind: 'number' },
      { key: 'sgd_hourly_rate', label: 'SGD Hourly Rate', editable: true, kind: 'number' },
      { key: 'sgd_contract_total', label: 'SGD Contract Total', editable: true, kind: 'number' },
      { key: 'sgd_remaining', label: 'SGD Remaining', editable: true, kind: 'number' },
      { key: 'sales_amo', label: 'Sales AMO', editable: true },
    ],
  },
  {
    key: 'unmatched', label: 'Unmatched Queue', table: 'master_unmatched', orderBy: 'last_seen', hasActive: false, canAdd: false,
    cols: [
      { key: 'kind', label: 'Kind' },
      { key: 'raw_value', label: 'Raw Value', width: 'min-w-[240px]' },
      { key: 'source', label: 'Source' },
      { key: 'occurrences', label: 'Seen', kind: 'number' },
      { key: 'first_seen', label: 'First Seen', kind: 'timestamp' },
      { key: 'last_seen', label: 'Last Seen', kind: 'timestamp' },
      { key: 'resolved', label: 'Resolved', kind: 'bool' },
    ],
  },
]

function cellText(v: unknown, kind?: Col['kind']): string {
  if (v === null || v === undefined) return ''
  if (kind === 'array') return Array.isArray(v) ? v.join(', ') : String(v)
  if (kind === 'bool') return v ? '✓' : '—'
  if (kind === 'timestamp') {
    const d = new Date(String(v))
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return String(v)
}

export function MasterDataClient() {
  const { toast } = useToast()
  const [tabKey, setTabKey] = useState('people')
  const [data, setData] = useState<Record<string, Row[]>>({})
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<{ rowId: string | number; col: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [busyId, setBusyId] = useState<string | number | null>(null)
  const [csmImportBusy, setCsmImportBusy] = useState(false)
  const csmFileRef = useRef<HTMLInputElement>(null)

  const tab = TABS.find(t => t.key === tabKey)!

  const loadTab = useCallback(async (t: TabDef, force = false) => {
    if (!force && data[t.key]) return
    setLoading(true)
    try {
      const { data: rows, error } = await createClient()
        .from(t.table).select('*').order(t.orderBy, { ascending: t.key !== 'unmatched' })
      if (error) throw error
      setData(prev => ({ ...prev, [t.key]: (rows as Row[]) ?? [] }))
    } catch (e) {
      toast(e instanceof Error ? e.message : `Failed loading ${t.label}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [data, toast])

  useEffect(() => { loadTab(tab) }, [tab, loadTab])
  // Load every tab once so the count badges fill in
  useEffect(() => { TABS.forEach(t => loadTab(t)) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    let list = data[tab.key] ?? []
    if (tab.hasActive && !showInactive) list = list.filter(r => r.active !== false)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(r => tab.cols.some(c => {
        const v = r[c.key]
        return v !== null && v !== undefined && String(Array.isArray(v) ? v.join(' ') : v).toLowerCase().includes(q)
      }))
    }
    return list
  }, [data, tab, search, showInactive])

  async function saveCell(row: Row, col: Col) {
    const t = tab
    let value: unknown = editValue
    if (col.kind === 'number') {
      const n = parseFloat(editValue)
      value = editValue.trim() === '' ? null : (isFinite(n) ? n : null)
    } else if (editValue.trim() === '') value = null
    setEditing(null)
    if (cellText(row[col.key], col.kind) === cellText(value, col.kind)) return
    const { error } = await createClient()
      .from(t.table).update({ [col.key]: value, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (error) { toast(error.message, 'error'); return }
    setData(prev => ({
      ...prev,
      [t.key]: (prev[t.key] ?? []).map(r => r.id === row.id ? { ...r, [col.key]: value } : r),
    }))
    toast('Saved', 'success')
  }

  async function toggleFlag(row: Row, field: 'active' | 'resolved') {
    const t = tab
    setBusyId(row.id)
    const next = !(row[field] === true)
    const payload: Record<string, unknown> = { [field]: next }
    if (t.hasActive) payload.updated_at = new Date().toISOString()
    const { error } = await createClient().from(t.table).update(payload).eq('id', row.id)
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    setData(prev => ({
      ...prev,
      [t.key]: (prev[t.key] ?? []).map(r => r.id === row.id ? { ...r, [field]: next } : r),
    }))
  }

  async function deleteRow(row: Row) {
    const t = tab
    const label = cellText(row[t.cols.find(c => c.editable)?.key ?? t.cols[0].key]) || String(row.id)
    if (!confirm(`Delete "${label}" from ${t.label}? This cannot be undone and affects the PSGC Dashboard too.`)) return
    setBusyId(row.id)
    const { error } = await createClient().from(t.table).delete().eq('id', row.id)
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    setData(prev => ({ ...prev, [t.key]: (prev[t.key] ?? []).filter(r => r.id !== row.id) }))
    toast('Deleted', 'success')
  }

  async function addRow() {
    const t = tab
    const { data: inserted, error } = await createClient()
      .from(t.table).insert(t.addDefaults ?? {}).select('*').single()
    if (error) { toast(error.message, 'error'); return }
    setData(prev => ({ ...prev, [t.key]: [inserted as Row, ...(prev[t.key] ?? [])] }))
    toast('Row added — click cells to edit', 'success')
  }

  function handleCsmImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const buf = ev.target?.result
      if (!buf) return
      setCsmImportBusy(true)
      try {
        const { rows: parsed, warnings } = parseCsmMonitoringXLS(buf as ArrayBuffer)
        if (parsed.length === 0) { toast(warnings[0] ?? 'No rows found in the file', 'warning'); return }
        const payload = parsed.map(r => ({
          project_name: r.project_name,
          contract_type: r.contract_type || null,
          assignee: r.assignee || null,
          status: r.status || null,
          start_date: r.start_date || null,
          contract_end_date: r.contract_end_date || null,
          team: r.team || null,
          transition_date: r.transition_date || null,
          total_contracted_hours: r.total_contracted_hours,
          total_billed_hours: r.total_billed_hours,
          remaining_hours: r.remaining_hours,
          sales_amo: r.sales_amo || null,
          country: r.country || null,
          customer_health: r.customer_health || null,
          sgd_hourly_rate: r.sgd_hourly_rate,
          sgd_contract_total: r.sgd_contract_total,
          sgd_remaining: r.sgd_remaining,
          extended_expiry_date: r.extended_expiry_date || null,
          updated_at: new Date().toISOString(),
        }))
        const { error } = await createClient().from('csm_projects').upsert(payload, { onConflict: 'project_name' })
        if (error) throw error
        toast(`Imported ${payload.length} CSM contract row${payload.length === 1 ? '' : 's'}`, 'success')
        await loadTab(TABS.find(t => t.key === 'csm')!, true)
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Import failed', 'error')
      } finally {
        setCsmImportBusy(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Master Data</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Canonical records shared with the PSGC Dashboard — changes here apply to both apps.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const count = data[t.key]?.length
          return (
            <button
              key={t.key}
              onClick={() => setTabKey(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                tabKey === t.key
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {t.label}
              {count !== undefined && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${tabKey === t.key ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab.label.toLowerCase()}…`}
            className="w-full border border-slate-200 rounded-lg text-sm pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {tab.hasActive && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-teal-600" />
            Show inactive
          </label>
        )}
        {tab.key === 'csm' && (
          <>
            <button
              onClick={() => csmFileRef.current?.click()}
              disabled={csmImportBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 transition-colors ml-auto"
            >
              {csmImportBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Import Excel
            </button>
            <input ref={csmFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleCsmImportFile} />
          </>
        )}
        {tab.canAdd && (
          <button
            onClick={addRow}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors ${tab.key === 'csm' ? '' : 'ml-auto'}`}
          >
            <Plus size={12} /> Add row
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-xs text-slate-500 uppercase tracking-wide">
                {tab.cols.map(c => (
                  <th key={c.key} className={`text-left px-3 py-2.5 font-medium whitespace-nowrap ${c.width ?? ''}`}>{c.label}</th>
                ))}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data[tab.key] && (
                <tr><td colSpan={tab.cols.length + 1} className="px-4 py-10 text-center text-slate-400">
                  <Loader2 size={16} className="animate-spin inline mr-2" />Loading…
                </td></tr>
              )}
              {rows.map(row => {
                const inactive = tab.hasActive && row.active === false
                return (
                  <tr key={String(row.id)} className={`hover:bg-slate-50/60 ${inactive ? 'opacity-50' : ''}`}>
                    {tab.cols.map(c => {
                      const isEditing = editing?.rowId === row.id && editing.col === c.key
                      return (
                        <td key={c.key} className={`px-3 py-2 ${c.width ?? ''}`}>
                          {isEditing ? (
                            <input
                              autoFocus
                              type={c.kind === 'number' ? 'number' : 'text'}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveCell(row, c)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                if (e.key === 'Escape') setEditing(null)
                              }}
                              className="w-full border border-teal-300 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          ) : c.editable ? (
                            <button
                              onClick={() => { setEditing({ rowId: row.id, col: c.key }); setEditValue(row[c.key] === null || row[c.key] === undefined ? '' : String(row[c.key])) }}
                              className="w-full text-left text-slate-700 hover:bg-teal-50 rounded px-1 py-0.5 min-h-[26px] cursor-text"
                              title="Click to edit"
                            >
                              {cellText(row[c.key], c.kind) || <span className="text-slate-300">—</span>}
                            </button>
                          ) : (
                            <span className="text-slate-500">{cellText(row[c.key], c.kind) || '—'}</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        {tab.key === 'unmatched' ? (
                          <button
                            disabled={busyId === row.id}
                            onClick={() => toggleFlag(row, 'resolved')}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                              row.resolved ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-emerald-500 text-white hover:bg-emerald-400'
                            }`}
                          >
                            {row.resolved ? 'Unresolve' : 'Resolve'}
                          </button>
                        ) : tab.hasActive && (
                          <button
                            disabled={busyId === row.id}
                            onClick={() => toggleFlag(row, 'active')}
                            className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {row.active === false ? 'Activate' : 'Deactivate'}
                          </button>
                        )}
                        <button
                          disabled={busyId === row.id}
                          onClick={() => deleteRow(row)}
                          className="px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={tab.cols.length + 1} className="px-4 py-10 text-center text-slate-400 text-sm">No rows found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
