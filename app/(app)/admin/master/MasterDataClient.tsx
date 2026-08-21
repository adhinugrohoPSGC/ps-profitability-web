'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Search, Loader2, ArrowUp, ArrowDown, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import MultiSelect from '@/components/MultiSelect'
import { buildFacets, type FacetDef } from '@/lib/facets'
import { SERVICE_OPTIONS } from '@/lib/serviceOptions'

type Row = Record<string, unknown> & { id: string | number }

type Col = {
  key: string
  label: string
  editable?: boolean
  kind?: 'text' | 'number' | 'bool' | 'array' | 'timestamp'
  options?: string[] // renders a dropdown instead of a text input
  // What an emptied cell writes. Defaults to null; NOT NULL columns (all of
  // master_vendor) must use '' or the update is rejected.
  emptyValue?: '' | null
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
      { key: 'project_code', label: 'Customer', editable: true },
      { key: 'canonical_name', label: 'Canonical Name', editable: true, width: 'min-w-[240px]' },
      { key: 'team', label: 'Team', editable: true, options: ['CSM', 'Delivery'] },
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
    // Shared with the PSGC Dashboard — same master_vendor table, so edits here are canonical for both apps.
    key: 'vendors', label: '3rd Party Vendors', table: 'master_vendor', orderBy: 'product_name', hasActive: true, canAdd: true,
    addDefaults: { vendor_name: '', product_name: 'New product', services: '', active: true },
    cols: [
      { key: 'vendor_name', label: 'Vendor', editable: true, emptyValue: '', width: 'min-w-[180px]' },
      { key: 'product_name', label: '3rd Party Product', editable: true, emptyValue: '', width: 'min-w-[200px]' },
      { key: 'services', label: 'Service', editable: true, emptyValue: '', options: [...SERVICE_OPTIONS], width: 'min-w-[200px]' },
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

// Numbers right-align here as they do in DataTable, so figures line up
// column-to-column across the app.
const alignOf = (c: Col) => c.kind === 'number' ? 'text-right' : 'text-left'

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
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [facetSel, setFacetSel] = useState<Record<string, string[]>>({})

  const tab = TABS.find(t => t.key === tabKey)!

  // Filters and sort are per-tab concerns — clear them when switching tabs
  useEffect(() => { setSort(null); setFacetSel({}); setSearch('') }, [tabKey])

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

  // Dropdown filters are auto-generated for plain-text columns with a small
  // set of distinct values (e.g. Team, Region, Status) — free-text columns
  // stay covered by the search box.
  const facetDefs = useMemo<FacetDef<Row>[]>(() => {
    const list = data[tab.key] ?? []
    if (list.length === 0) return []
    return tab.cols
      .filter(c => !c.kind)
      .map(c => ({ col: c, distinct: new Set(list.map(r => String(r[c.key] ?? '')).filter(Boolean)).size }))
      .filter(x => x.distinct >= 2 && x.distinct <= 30)
      .map(x => ({
        key: x.col.key,
        label: `All ${x.col.label.toLowerCase()}`,
        get: (r: Row) => { const v = r[x.col.key]; return v === null || v === undefined ? null : String(v) },
      }))
  }, [data, tab])

  const facets = useMemo(() => {
    let list = data[tab.key] ?? []
    if (tab.hasActive && !showInactive) list = list.filter(r => r.active !== false)
    return buildFacets(list, facetDefs, facetSel, search, r => tab.cols.map(c => {
      const v = r[c.key]
      return v === null || v === undefined ? null : Array.isArray(v) ? v.join(' ') : String(v)
    }))
  }, [data, tab, showInactive, facetDefs, facetSel, search])

  const rows = useMemo(() => {
    const list = facets.filtered
    if (!sort) return list
    const col = tab.cols.find(c => c.key === sort.key)
    if (!col) return list
    const val = (r: Row): string | number | null => {
      const v = r[col.key]
      if (v === null || v === undefined || v === '') return null
      if (col.kind === 'number') { const n = Number(v); return isNaN(n) ? null : n }
      if (col.kind === 'bool') return v ? 1 : 0
      if (col.kind === 'array') return Array.isArray(v) ? v.join(', ').toLowerCase() : String(v).toLowerCase()
      return String(v).toLowerCase() // timestamps are ISO strings — lexicographic works
    }
    const { dir } = sort
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1 // nulls last regardless of direction
      if (vb === null) return -1
      if (va < vb) return -dir
      if (va > vb) return dir
      return 0
    })
  }, [facets, sort, tab])

  function toggleSort(key: string) {
    setSort(s => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))
  }

  async function saveCell(row: Row, col: Col, valueOverride?: string) {
    const t = tab
    const raw = valueOverride ?? editValue
    let value: unknown = raw
    if (col.kind === 'number') {
      const n = parseFloat(raw)
      value = raw.trim() === '' ? null : (isFinite(n) ? n : null)
    } else if (raw.trim() === '') value = col.emptyValue ?? null
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Master Data</h1>
        <p className="text-sm text-slate-400 mt-0.5">
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
        {facetDefs.map(f => (
          <MultiSelect
            key={f.key}
            label={f.label}
            options={facets.options[f.key] ?? []}
            selected={facetSel[f.key] ?? []}
            onChange={values => setFacetSel(s => ({ ...s, [f.key]: values }))}
          />
        ))}
        {(search || Object.values(facetSel).some(v => v.length)) && (
          <button
            onClick={() => { setSearch(''); setFacetSel({}) }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-2"
          >
            <X size={12} /> Reset
          </button>
        )}
        <span className="text-xs text-slate-400 whitespace-nowrap">{rows.length} / {(data[tab.key] ?? []).length}</span>
        {tab.hasActive && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-teal-600" />
            Show inactive
          </label>
        )}
        {tab.canAdd && (
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors ml-auto"
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
                {tab.cols.map(c => {
                  const sorted = sort?.key === c.key
                  return (
                    <th
                      key={c.key}
                      aria-sort={sorted ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                      className={`px-3 py-2.5 font-medium whitespace-nowrap ${alignOf(c)} ${c.width ?? ''}`}
                    >
                      <button
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 ${sorted ? 'text-teal-600' : ''}`}
                      >
                        {c.label}
                        {sorted && (sort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </button>
                    </th>
                  )
                })}
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
                        <td key={c.key} className={`px-3 py-2 ${alignOf(c)} ${c.width ?? ''}`}>
                          {isEditing ? (
                            c.options ? (
                              <select
                                autoFocus
                                value={editValue}
                                onChange={e => saveCell(row, c, e.target.value)}
                                onBlur={() => setEditing(null)}
                                onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }}
                                className="w-full border border-teal-300 rounded px-1.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                              >
                                <option value="">—</option>
                                {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
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
                            )
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
