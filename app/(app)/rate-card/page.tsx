'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Edit2, Trash2, Upload, Download, Search, Check, X, Users, FileSpreadsheet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import Modal from '@/components/Modal'

interface RateCardRow {
  id: number
  consultant_name: string
  email: string | null
  role: string | null
  cost_rate_sgd: number
  bill_rate_sgd: number
  effective_from: string | null
  effective_to: string | null
  active: boolean
}

type FormState = Omit<RateCardRow, 'id'>

const TEMPLATE_HEADERS = [
  'Consultant Name',
  'Email',
  'Role',
  'Cost Rate (SGD/hr)',
  'Bill Rate (SGD/hr)',
  'Effective From',
  'Effective To',
  'Active (TRUE/FALSE)',
]

function defaultForm(): FormState {
  return {
    consultant_name: '', email: null, role: 'Consultant',
    cost_rate_sgd: 0, bill_rate_sgd: 0,
    effective_from: null, effective_to: null, active: true,
  }
}

const fmt = (v: number) => new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

function parseActiveFlag(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v ?? '').trim().toLowerCase()
  return s === '' || s === 'true' || s === 'yes' || s === '1'
}

function parseDate(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const d = XLSX.SSF.parse_date_code(Number(s))
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return s
}

export default function RateCardPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<RateCardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm())
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [importPreview, setImportPreview] = useState<FormState[]>([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await createClient().from('rate_card').select('*').order('consultant_name')
      if (error) throw error
      setRows((data as RateCardRow[]) ?? [])
    } catch {
      toast('Failed to load rate card data', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchRows() }, [fetchRows])

  const filtered = rows.filter(r =>
    r.consultant_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.role ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() { setForm(defaultForm()); setEditingId(null); setShowModal(true) }
  function openEdit(row: RateCardRow) {
    setForm({
      consultant_name: row.consultant_name,
      email: row.email,
      role: row.role,
      cost_rate_sgd: row.cost_rate_sgd,
      bill_rate_sgd: row.bill_rate_sgd,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      active: row.active,
    })
    setEditingId(row.id)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.consultant_name.trim()) { toast('Consultant name is required', 'error'); return }
    setSaving(true)
    try {
      const supabase = createClient()
      const entry = {
        consultant_name: form.consultant_name.trim(),
        email: form.email,
        role: form.role,
        cost_rate_sgd: form.cost_rate_sgd,
        cost_rate_idr: 0,
        bill_rate_sgd: form.bill_rate_sgd,
        bill_rate_idr: 0,
        effective_from: form.effective_from,
        effective_to: form.effective_to,
        active: form.active,
      }
      if (editingId !== null) {
        const { error } = await supabase.from('rate_card').update(entry).eq('id', editingId)
        if (error) throw error
        toast('Rate card entry updated', 'success')
      } else {
        const { error } = await supabase.from('rate_card').insert(entry)
        if (error) throw error
        toast('Consultant added', 'success')
      }
      setShowModal(false)
      await fetchRows()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (deleteId === null) return
    try {
      const { error } = await createClient().from('rate_card').delete().eq('id', deleteId)
      if (error) throw error
      toast('Consultant removed', 'success')
      setShowDeleteModal(false)
      setDeleteId(null)
      await fetchRows()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  async function toggleActive(row: RateCardRow) {
    try {
      const { error } = await createClient().from('rate_card').update({ active: !row.active }).eq('id', row.id)
      if (error) throw error
      await fetchRows()
    } catch { toast('Failed to update status', 'error') }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const buffer = ev.target?.result as ArrayBuffer
        const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        const mapped: FormState[] = jsonRows
          .filter(r => String(r['Consultant Name'] ?? '').trim())
          .map(r => ({
            consultant_name: String(r['Consultant Name']).trim(),
            email: String(r['Email'] ?? '').trim() || null,
            role: String(r['Role'] ?? 'Consultant').trim() || 'Consultant',
            cost_rate_sgd: parseFloat(String(r['Cost Rate (SGD/hr)'] ?? '0')) || 0,
            bill_rate_sgd: parseFloat(String(r['Bill Rate (SGD/hr)'] ?? '0')) || 0,
            effective_from: parseDate(r['Effective From']),
            effective_to: parseDate(r['Effective To']),
            active: parseActiveFlag(r['Active (TRUE/FALSE)']),
          }))

        if (mapped.length === 0) {
          toast('No valid rows found. Make sure you are using the correct template.', 'error')
          return
        }

        setImportPreview(mapped)
        setShowImportModal(true)
      } catch {
        toast('Failed to read file. Please use the downloaded template.', 'error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function confirmImport() {
    if (importPreview.length === 0) return
    setImporting(true)
    try {
      const supabase = createClient()
      // Insert with idr fields defaulted to 0 (kept in DB schema but not used in UI)
      const entries = importPreview.map(r => ({
        ...r,
        cost_rate_idr: 0,
        bill_rate_idr: 0,
      }))
      const { error } = await supabase.from('rate_card').insert(entries)
      if (error) throw error
      toast(`Successfully imported ${importPreview.length} consultant${importPreview.length !== 1 ? 's' : ''}`, 'success')
      setShowImportModal(false)
      setImportPreview([])
      await fetchRows()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error')
    } finally {
      setImporting(false)
    }
  }

  function handleExportTemplate() {
    const example = ['Alice Tan', 'alice@example.com', 'Senior Consultant', 150, 250, '2025-01-01', '', 'TRUE']
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, example])
    ws['!cols'] = [
      { wch: 22 }, { wch: 28 }, { wch: 20 },
      { wch: 20 }, { wch: 20 },
      { wch: 14 }, { wch: 14 }, { wch: 18 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rate Card')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rate-card-template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const f = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v: string | number | boolean | null =
      e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked
      : e.target.type === 'number' ? parseFloat(e.target.value) || 0
      : e.target.value === '' ? null : e.target.value
    setForm(prev => ({ ...prev, [k]: v }))
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search consultants…"
              className="pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
            />
          </div>
          <span className="text-xs text-slate-400">{filtered.length} / {rows.length} consultants</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportTemplate} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
            <Download size={14} /> Template
          </button>
          <button onClick={() => importRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
            <Upload size={14} /> Bulk Import
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">
            <Plus size={14} /> Add Consultant
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users size={32} className="mx-auto mb-3 text-slate-300" />
          {search ? 'No consultants match your search.' : 'No consultants yet. Add one or bulk import.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Consultant</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-right px-4 py-3">Cost Rate (SGD/hr)</th>
                <th className="text-right px-4 py-3">Bill Rate (SGD/hr)</th>
                <th className="text-left px-4 py-3">Effective From</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{row.consultant_name}</p>
                    {row.email && <p className="text-xs text-slate-400">{row.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.role ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-700 font-mono">{fmt(row.cost_rate_sgd)}</td>
                  <td className="px-4 py-3 text-right text-slate-700 font-mono">{fmt(row.bill_rate_sgd)}</td>
                  <td className="px-4 py-3 text-slate-500">{row.effective_from ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(row)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {row.active ? <><Check size={10} /> Active</> : <><X size={10} /> Inactive</>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(row)} className="p-1.5 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50"><Edit2 size={14} /></button>
                      <button onClick={() => { setDeleteId(row.id); setShowDeleteModal(true) }} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={showModal} title={editingId !== null ? 'Edit Consultant' : 'Add Consultant'} onClose={() => setShowModal(false)}>
        <div className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Consultant Name *</label>
              <input value={form.consultant_name} onChange={f('consultant_name')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input value={form.email ?? ''} onChange={f('email')} type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
              <select value={form.role ?? 'Consultant'} onChange={f('role')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                {['Consultant', 'Senior Consultant', 'Manager', 'Senior Manager', 'Director', 'Partner'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cost Rate (SGD/hr)</label>
              <input value={form.cost_rate_sgd} onChange={f('cost_rate_sgd')} type="number" min="0" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bill Rate (SGD/hr)</label>
              <input value={form.bill_rate_sgd} onChange={f('bill_rate_sgd')} type="number" min="0" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Effective From</label>
              <input value={form.effective_from ?? ''} onChange={f('effective_from')} type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Effective To</label>
              <input value={form.effective_to ?? ''} onChange={f('effective_to')} type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
            <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="accent-teal-600" />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium">
              {saving ? 'Saving…' : editingId !== null ? 'Save Changes' : 'Add Consultant'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={showDeleteModal} title="Remove Consultant" onClose={() => setShowDeleteModal(false)}>
        <div className="p-1 space-y-4">
          <p className="text-sm text-slate-600">Are you sure you want to remove this consultant? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Remove</button>
          </div>
        </div>
      </Modal>

      {/* Bulk Import Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={18} className="text-teal-600" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Import Preview</h2>
                  <p className="text-xs text-slate-400">{importPreview.length} row{importPreview.length !== 1 ? 's' : ''} ready to import — review before confirming</p>
                </div>
              </div>
              <button onClick={() => { setShowImportModal(false); setImportPreview([]) }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Consultant</th>
                    <th className="text-left px-3 py-2 font-medium">Role</th>
                    <th className="text-right px-3 py-2 font-medium">Cost (SGD/hr)</th>
                    <th className="text-right px-3 py-2 font-medium">Bill (SGD/hr)</th>
                    <th className="text-left px-3 py-2 font-medium">Eff. From</th>
                    <th className="text-left px-3 py-2 font-medium">Eff. To</th>
                    <th className="text-center px-3 py-2 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{r.consultant_name}</p>
                        {r.email && <p className="text-slate-400">{r.email}</p>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.role ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(r.cost_rate_sgd)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(r.bill_rate_sgd)}</td>
                      <td className="px-3 py-2 text-slate-500">{r.effective_from ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{r.effective_to ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium ${r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {r.active ? <><Check size={9} /> Yes</> : <><X size={9} /> No</>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0 bg-slate-50">
              <p className="text-xs text-slate-500">All rows will be added as new entries.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowImportModal(false); setImportPreview([]) }}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-white text-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importing}
                  className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium"
                >
                  {importing ? 'Importing…' : `Import ${importPreview.length} Consultant${importPreview.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
