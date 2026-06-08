'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Edit2, Trash2, Upload, Download, Search, Check, X, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import Modal from '@/components/Modal'

interface RateCardRow {
  id: number
  consultant_name: string
  email: string | null
  role: string | null
  cost_rate_sgd: number
  cost_rate_idr: number
  bill_rate_sgd: number
  bill_rate_idr: number
  effective_from: string | null
  effective_to: string | null
  active: boolean
}

type FormState = Omit<RateCardRow, 'id'>

function defaultForm(): FormState {
  return {
    consultant_name: '', email: null, role: 'Consultant',
    cost_rate_sgd: 0, cost_rate_idr: 0, bill_rate_sgd: 0, bill_rate_idr: 0,
    effective_from: null, effective_to: null, active: true,
  }
}

const fmt = (v: number) => new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

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
    setForm({ ...row })
    setEditingId(row.id)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.consultant_name.trim()) { toast('Consultant name is required', 'error'); return }
    setSaving(true)
    try {
      const supabase = createClient()
      const entry = { ...form, consultant_name: form.consultant_name.trim() }
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

  async function handleBulkImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
    const mapped = jsonRows
      .filter(r => r['Consultant Name'])
      .map(r => ({
        consultant_name: String(r['Consultant Name'] ?? '').trim(),
        email: String(r['Email'] ?? '').trim() || null,
        role: String(r['Role'] ?? 'Consultant').trim(),
        cost_rate_sgd: parseFloat(String(r['Cost Rate SGD/hr'] ?? r['Cost Rate USD/hr'] ?? '0')) || 0,
        cost_rate_idr: 0,
        bill_rate_sgd: parseFloat(String(r['Bill Rate SGD/hr'] ?? r['Bill Rate USD/hr'] ?? '0')) || 0,
        bill_rate_idr: 0,
        effective_from: r['Effective From'] ? String(r['Effective From']).trim() : null,
        effective_to: null,
        active: true,
      }))
    if (mapped.length === 0) { toast('No valid rows found in file', 'warning'); return }
    const { error } = await createClient().from('rate_card').upsert(mapped, { onConflict: 'consultant_name,effective_from' })
    if (error) { toast(`Import failed: ${error.message}`, 'error'); return }
    toast(`Imported ${mapped.length} consultants`, 'success')
    await fetchRows()
  }

  function handleExportTemplate() {
    const headers = ['Consultant Name', 'Email', 'Role', 'Cost Rate SGD/hr', 'Bill Rate SGD/hr', 'Effective From']
    const example = [['Alice Tan', 'alice@example.com', 'Senior Consultant', 150, 250, '2025-01-01']]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example])
    ws['!cols'] = [{ wch: 22 }, { wch: 25 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rate Card')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'rate-card-template.xlsx'; a.click()
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
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkImport} />
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
                <th className="text-right px-4 py-3">Cost Rate SGD</th>
                <th className="text-right px-4 py-3">Bill Rate SGD</th>
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Cost Rate SGD/hr</label>
              <input value={form.cost_rate_sgd} onChange={f('cost_rate_sgd')} type="number" min="0" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bill Rate SGD/hr</label>
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
    </div>
  )
}
