'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Trash2, Archive, BarChart2, FolderKanban, Search, DollarSign, X } from 'lucide-react'
import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import { useProject } from '@/contexts/ProjectContext'
import Modal from '@/components/Modal'
import ExpensesCard from '@/components/ExpensesCard'
import DataTable, { type DataColumn } from '@/components/DataTable'
import MultiSelect from '@/components/MultiSelect'
import { buildFacets, type FacetDef } from '@/lib/facets'

interface Project {
  id: string
  name: string
  project_manager: string | null
  start_date: string | null
  end_date: string | null
  contract_value: number
  contract_currency: string
  billing_type: string
  phases: string
  status: string
  notes: string | null
  external_id: string | null
  created_at: string
  master_project?: { project_code: string | null; region: string | null; product: string | null } | null
}

interface BudgetLine {
  id?: number
  project_id: string
  phase: string
  budgeted_hours: number
  budgeted_cost: number
  budgeted_revenue: number
}

type ProjectForm = Omit<Project, 'id' | 'created_at' | 'contract_value' | 'master_project'>

function defaultForm(): ProjectForm {
  return {
    name: '', project_manager: '',
    start_date: '', end_date: '',
    contract_currency: 'SGD', billing_type: 'Fixed Fee',
    phases: 'Discovery,Design,Build,Testing,Go-Live',
    status: 'active', notes: '', external_id: null,
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

const PROJECT_FACETS: FacetDef<Project>[] = [
  { key: 'pm', label: 'All PMs', get: r => r.project_manager },
  { key: 'status', label: 'All statuses', get: r => r.status },
  { key: 'billing_type', label: 'All billing types', get: r => r.billing_type },
]

export default function ProjectsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { setSelectedProject } = useProject()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [facetSel, setFacetSel] = useState<Record<string, string[]>>(
    () => Object.fromEntries(PROJECT_FACETS.map(f => [f.key, [] as string[]])))
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectForm>(defaultForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [expenseProject, setExpenseProject] = useState<Project | null>(null)
  const [budgetProject, setBudgetProject] = useState<Project | null>(null)
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([])
  const [budgetSaving, setBudgetSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await createClient()
        .from('projects').select('*, master_project(project_code, region, product)').order('created_at', { ascending: false })
      if (error) throw error
      setProjects((data as Project[]) ?? [])
    } catch { toast('Failed to load projects', 'error') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { reload() }, [reload])

  const facets = useMemo(() =>
    buildFacets(projects, PROJECT_FACETS, facetSel, search,
      p => [p.name, p.project_manager, p.external_id]),
    [projects, facetSel, search])
  const filtered = facets.filtered
  const hasFilter = !!search || Object.values(facetSel).some(v => v.length)

  function openAdd() { setForm(defaultForm()); setEditingId(null); setShowModal(true) }
  function openEdit(p: Project) {
    setForm({
      name: p.name, project_manager: p.project_manager ?? '',
      start_date: p.start_date ?? '', end_date: p.end_date ?? '',
      contract_currency: p.contract_currency,
      billing_type: p.billing_type, phases: p.phases,
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
        const { error } = await supabase.from('projects').insert({ ...payload, contract_value: 0 })
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

  async function loadBudget(p: Project) {
    const { data } = await createClient()
      .from('project_budget')
      .select('*')
      .eq('project_id', p.id)
      .order('id')
    setBudgetLines((data ?? []) as BudgetLine[])
    setBudgetProject(p)
  }

  async function saveBudget() {
    if (!budgetProject) return
    setBudgetSaving(true)
    try {
      await createClient().from('project_budget').delete().eq('project_id', budgetProject.id)
      const toInsert = budgetLines
        .filter(l => l.phase.trim())
        .map(({ id: _id, ...rest }) => ({ ...rest, project_id: budgetProject.id }))
      if (toInsert.length) {
        const { error } = await createClient().from('project_budget').insert(toInsert)
        if (error) throw error
      }
      toast('Budget saved', 'success')
      setBudgetProject(null)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setBudgetSaving(false)
    }
  }

  function updateBudgetLine(idx: number, field: keyof BudgetLine, value: string | number) {
    setBudgetLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function addBudgetLine() {
    if (!budgetProject) return
    setBudgetLines(prev => [...prev, { project_id: budgetProject.id, phase: '', budgeted_hours: 0, budgeted_cost: 0, budgeted_revenue: 0 }])
  }

  function removeBudgetLine(idx: number) {
    setBudgetLines(prev => prev.filter((_, i) => i !== idx))
  }

  function handleOpenDashboard(p: Project) {
    setSelectedProject(p.id)
    router.push('/dashboard')
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500'

  const editingProject = editingId ? projects.find(p => p.id === editingId) ?? null : null

  const projectColumns: DataColumn<Project>[] = [
    { key: 'name', label: 'Project', width: 340, sortValue: p => p.name.toLowerCase(),
      render: p => (
        <>
          <p className="font-medium text-slate-800 truncate" title={p.name}>{p.name}</p>
          {(p.start_date || p.end_date) && (
            <p className="text-xs text-slate-400 truncate">{p.start_date ?? '?'} → {p.end_date ?? 'ongoing'}</p>
          )}
        </>
      ) },
    { key: 'pm', label: 'PM', width: 150, sortValue: p => p.project_manager?.toLowerCase() || null,
      render: p => <span className="text-slate-600 truncate block" title={p.project_manager ?? ''}>{p.project_manager || '—'}</span> },
    { key: 'status', label: 'Status', width: 110, sortValue: p => p.status,
      render: p => (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {p.status}
        </span>
      ) },
    { key: 'billing_type', label: 'Billing', width: 100, sortValue: p => p.billing_type,
      render: p => <span className="text-slate-500 text-xs">{p.billing_type}</span> },
    { key: 'region', label: 'Region', width: 100, sortValue: p => p.master_project?.region ?? null,
      render: p => <span className="text-slate-500 text-xs">{p.master_project?.region ?? '—'}</span> },
    { key: 'contract', label: 'Billing Value', width: 130, align: 'right', sortValue: p => p.contract_value || null,
      render: p => <span className="font-mono text-slate-800 font-medium">{p.contract_value > 0 ? fmt(p.contract_value, p.contract_currency) : '—'}</span> },
    { key: 'start', label: 'Start', width: 110, sortValue: p => p.start_date,
      render: p => <span className="font-mono text-xs text-slate-500">{p.start_date ?? '—'}</span> },
    { key: 'end', label: 'End', width: 110, sortValue: p => p.end_date,
      render: p => <span className="font-mono text-xs text-slate-500">{p.end_date ?? '—'}</span> },
    { key: 'actions', label: '', width: 200,
      render: p => (
        <div className="flex items-center gap-1">
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
          <button onClick={() => setExpenseProject(p)} title="Add Expenses"
            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
            <DollarSign size={14} />
          </button>
          <button onClick={() => loadBudget(p)} title="Edit Budget"
            className="p-1.5 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
            <BarChart2 size={14} />
          </button>
          <button onClick={() => setDeleteTarget(p)} title="Delete"
            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      ) },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
        </div>
        {PROJECT_FACETS.map(f => (
          <MultiSelect key={f.key} label={f.label} options={facets.options[f.key]} selected={facetSel[f.key]}
            onChange={values => setFacetSel(s => ({ ...s, [f.key]: values }))} />
        ))}
        {hasFilter && (
          <button
            onClick={() => { setSearch(''); setFacetSel(Object.fromEntries(PROJECT_FACETS.map(f => [f.key, []]))) }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-2"
          >
            <X size={12} /> Reset
          </button>
        )}
        <span className="text-xs text-slate-400">{filtered.length} / {projects.length}</span>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">
          <Plus size={14} /> New Project
        </button>
      </div>

      {/* Project table */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FolderKanban size={32} className="mx-auto mb-3 text-slate-300" />
          {hasFilter ? 'No projects match the current filters.' : 'No projects yet. Create your first project.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <DataTable
            columns={projectColumns}
            rows={filtered}
            rowKey={p => p.id}
          />
        </div>
      )}

      {/* Project Form Modal */}
      <Modal open={showModal} title={editingId ? 'Edit Project' : 'New Project'} onClose={() => setShowModal(false)} maxWidth="max-w-2xl">
        <div className="space-y-3">
          {editingProject?.master_project && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Master: {editingProject.master_project.project_code ?? '—'} · {editingProject.master_project.region ?? '—'} · {editingProject.master_project.product ?? '—'}
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Project Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Project Manager</label>
              <input value={form.project_manager ?? ''} onChange={e => setForm(p => ({ ...p, project_manager: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kick Off Date</label>
              <input type="date" value={form.start_date ?? ''} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Go Live Date</label>
              <input type="date" value={form.end_date ?? ''} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className={inputCls} />
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
            <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
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

      {/* Expenses Upload Modal */}
      <Modal open={!!expenseProject} title={`Add Expenses — ${expenseProject?.name ?? ''}`} onClose={() => setExpenseProject(null)} maxWidth="max-w-3xl">
        <ExpensesCard selectedProject={expenseProject?.id ?? null} hideProjectWarning />
      </Modal>

      {/* Budget Line Editor Modal */}
      <Modal open={!!budgetProject} title={`Budget — ${budgetProject?.name ?? ''}`} onClose={() => setBudgetProject(null)} maxWidth="max-w-2xl">
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  {['Phase', 'Budg. Hours', 'Budg. Cost (SGD)', 'Budg. Revenue (SGD)', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {budgetLines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-1.5">
                      <input
                        value={line.phase}
                        onChange={e => updateBudgetLine(idx, 'phase', e.target.value)}
                        placeholder="Discovery"
                        className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number" min="0" step="0.5"
                        value={line.budgeted_hours}
                        onChange={e => updateBudgetLine(idx, 'budgeted_hours', parseFloat(e.target.value) || 0)}
                        className="w-24 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number" min="0"
                        value={line.budgeted_cost}
                        onChange={e => updateBudgetLine(idx, 'budgeted_cost', parseFloat(e.target.value) || 0)}
                        className="w-32 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number" min="0"
                        value={line.budgeted_revenue}
                        onChange={e => updateBudgetLine(idx, 'budgeted_revenue', parseFloat(e.target.value) || 0)}
                        className="w-32 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => removeBudgetLine(idx)} className="text-slate-300 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {budgetLines.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-400">No budget lines yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <button
            onClick={addBudgetLine}
            className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800"
          >
            <Plus size={14} /> Add Phase
          </button>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onClick={() => setBudgetProject(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">Cancel</button>
            <button
              onClick={saveBudget}
              disabled={budgetSaving}
              className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {budgetSaving ? 'Saving…' : 'Save Budget'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
