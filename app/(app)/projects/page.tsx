'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Trash2, Archive, BarChart2, FolderKanban, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import { useProject } from '@/contexts/ProjectContext'
import Modal from '@/components/Modal'

interface Project {
  id: string
  name: string
  client_name: string | null
  project_manager: string | null
  start_date: string | null
  end_date: string | null
  contract_value: number
  contract_currency: string
  billing_type: string
  phases: string
  overhead_rate_pct: number
  status: string
  notes: string | null
  external_id: string | null
  created_at: string
}

type ProjectForm = Omit<Project, 'id' | 'created_at'>

function defaultForm(): ProjectForm {
  return {
    name: '', client_name: '', project_manager: '',
    start_date: '', end_date: '', contract_value: 0,
    contract_currency: 'SGD', billing_type: 'Fixed Fee',
    phases: 'Discovery,Design,Build,Testing,Go-Live',
    overhead_rate_pct: 12, status: 'active', notes: '', external_id: null,
  }
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-blue-50 text-blue-700',
  archived: 'bg-slate-100 text-slate-500',
  'on-hold': 'bg-amber-50 text-amber-700',
}

const fmt = (v: number, currency = 'SGD') =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

export default function ProjectsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { setSelectedProject } = useProject()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectForm>(defaultForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await createClient()
        .from('projects').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setProjects((data as Project[]) ?? [])
    } catch { toast('Failed to load projects', 'error') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { reload() }, [reload])

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.project_manager ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() { setForm(defaultForm()); setEditingId(null); setShowModal(true) }
  function openEdit(p: Project) {
    setForm({
      name: p.name, client_name: p.client_name ?? '', project_manager: p.project_manager ?? '',
      start_date: p.start_date ?? '', end_date: p.end_date ?? '',
      contract_value: p.contract_value, contract_currency: p.contract_currency,
      billing_type: p.billing_type, phases: p.phases, overhead_rate_pct: p.overhead_rate_pct,
      status: p.status, notes: p.notes ?? '', external_id: p.external_id ?? null,
    })
    setEditingId(p.id)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('Project name is required', 'error'); return }
    setSaving(true)
    try {
      const supabase = createClient()
      const payload = {
        ...form,
        name: form.name.trim(),
        client_name: form.client_name || null,
        project_manager: form.project_manager || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        notes: form.notes || null,
        external_id: form.external_id || null,
      }
      if (editingId) {
        const { error } = await supabase.from('projects').update(payload).eq('id', editingId)
        if (error) throw error
        toast('Project updated', 'success')
      } else {
        const { error } = await supabase.from('projects').insert(payload)
        if (error) throw error
        toast('Project created', 'success')
      }
      setShowModal(false)
      await reload()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      const { error } = await createClient().from('projects').delete().eq('id', deleteTarget.id)
      if (error) throw error
      toast('Project deleted', 'success')
      setDeleteTarget(null)
      await reload()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  async function handleToggleArchive(p: Project) {
    const newStatus = p.status === 'archived' ? 'active' : 'archived'
    try {
      const { error } = await createClient().from('projects').update({ status: newStatus }).eq('id', p.id)
      if (error) throw error
      await reload()
    } catch { toast('Failed to update status', 'error') }
  }

  function handleOpenDashboard(p: Project) {
    setSelectedProject(p.id)
    router.push('/dashboard')
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
              className="pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 w-64" />
          </div>
          <span className="text-xs text-slate-400">{filtered.length} projects</span>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">
          <Plus size={14} /> New Project
        </button>
      </div>

      {/* Project Cards */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FolderKanban size={32} className="mx-auto mb-3 text-slate-300" />
          {search ? 'No projects match your search.' : 'No projects yet. Create your first project.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-800 truncate">{p.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {p.status}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{p.billing_type}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    {p.client_name && <span>Client: <span className="text-slate-700">{p.client_name}</span></span>}
                    {p.project_manager && <span>PM: <span className="text-slate-700">{p.project_manager}</span></span>}
                    {p.contract_value > 0 && <span>Contract: <span className="text-slate-700 font-medium">{fmt(p.contract_value, p.contract_currency)}</span></span>}
                  </div>
                  {(p.start_date || p.end_date) && (
                    <p className="text-xs text-slate-400 mt-1">{p.start_date ?? '?'} → {p.end_date ?? 'ongoing'}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                  <button onClick={() => handleOpenDashboard(p)} title="Open in Dashboard"
                    className="p-1.5 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
                    <BarChart2 size={15} />
                  </button>
                  <button onClick={() => openEdit(p)} title="Edit"
                    className="p-1.5 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleToggleArchive(p)} title={p.status === 'archived' ? 'Unarchive' : 'Archive'}
                    className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50">
                    <Archive size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(p)} title="Delete"
                    className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project Form Modal */}
      <Modal open={showModal} title={editingId ? 'Edit Project' : 'New Project'} onClose={() => setShowModal(false)} maxWidth="max-w-2xl">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Project Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Client Name</label>
              <input value={form.client_name ?? ''} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Project Manager</label>
              <input value={form.project_manager ?? ''} onChange={e => setForm(p => ({ ...p, project_manager: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
              <input type="date" value={form.start_date ?? ''} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
              <input type="date" value={form.end_date ?? ''} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contract Value</label>
              <input type="number" min="0" value={form.contract_value} onChange={e => setForm(p => ({ ...p, contract_value: parseFloat(e.target.value) || 0 }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
              <select value={form.contract_currency} onChange={e => setForm(p => ({ ...p, contract_currency: e.target.value }))} className={inputCls}>
                {['SGD', 'USD', 'IDR', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Billing Type</label>
              <select value={form.billing_type} onChange={e => setForm(p => ({ ...p, billing_type: e.target.value }))} className={inputCls}>
                {['Fixed Fee', 'T&M', 'Retainer'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Overhead Rate %</label>
              <input type="number" min="0" max="100" step="0.1" value={form.overhead_rate_pct} onChange={e => setForm(p => ({ ...p, overhead_rate_pct: parseFloat(e.target.value) || 0 }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phases (comma-separated)</label>
            <input value={form.phases} onChange={e => setForm(p => ({ ...p, phases: e.target.value }))} placeholder="Discovery,Design,Build,Testing,Go-Live" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className={inputCls}>
              {['active', 'on-hold', 'completed', 'archived'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">External Project ID <span className="text-slate-400 font-normal">(e.g. ClickUp ID for timesheet matching)</span></label>
            <input value={form.external_id ?? ''} onChange={e => setForm(p => ({ ...p, external_id: e.target.value }))} placeholder="e.g. 90168316816" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <input value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteTarget} title="Delete Project" onClose={() => setDeleteTarget(null)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Delete <strong>{deleteTarget?.name}</strong>? This will also delete all timesheet entries, expenses, and budget lines for this project. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Delete Project</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
