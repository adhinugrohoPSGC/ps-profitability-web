'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Building2, DollarSign, Gauge, Database, ChevronDown, ChevronUp, Check, AlertTriangle, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Settings {
  company_name: string
  primary_color: string
  default_currency: string
  usd_to_idr: string
  overhead_method: string
  overhead_rate_pct: string
  [key: string]: string
}

// ── Accordion section ─────────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ size: number; className?: string }>
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon size={16} className="text-teal-600" />
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100 px-5 py-5">{children}</div>}
    </div>
  )
}

// ── Field row ─────────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="w-52 flex-shrink-0">
        <p className="text-sm text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<Settings>({
    company_name: 'PS Global Consulting',
    primary_color: '#0d9488',
    default_currency: 'SGD',
    usd_to_idr: '11700',
    overhead_method: 'computed',
    overhead_rate_pct: '12',
  })
  const [saved, setSaved] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [clearError, setClearError] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    createClient().from('user_settings').select('key, value')
      .then(({ data }) => {
        if (data) {
          const map = Object.fromEntries(
            (data as { key: string; value: string }[]).map(r => [r.key, r.value ?? ''])
          )
          setSettings(prev => ({ ...prev, ...map }))
        }
      })
  }, [])

  const saveSetting = useCallback((key: string, value: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      await sb.from('user_settings').upsert(
        { user_id: user.id, key, value },
        { onConflict: 'user_id,key' }
      )
      setSaved(key)
      setTimeout(() => setSaved(null), 1500)
    }, 400)
  }, [])

  const update = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    saveSetting(key, value)
  }

  const handleExportJson = async () => {
    const sb = createClient()
    const [rc, ts, exp, proj] = await Promise.all([
      sb.from('rate_card').select('*'),
      sb.from('timesheet_entries').select('*'),
      sb.from('expense_entries').select('*'),
      sb.from('projects').select('*'),
    ])
    const data = {
      rate_card: rc.data,
      timesheet_entries: ts.data,
      expense_entries: exp.data,
      projects: proj.data,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ps-profitability-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        console.log('Import data preview:', Object.keys(data))
        alert('Backup preview loaded. Full restore not yet implemented.')
      } catch {
        alert('Invalid JSON file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleClearAll = async () => {
    if (deleteConfirm !== 'DELETE') {
      setClearError('Type DELETE (all caps) to confirm.')
      return
    }
    const sb = createClient()
    await Promise.all([
      sb.from('timesheet_entries').delete().neq('id', 0),
      sb.from('expense_entries').delete().neq('id', 0),
      sb.from('project_budget').delete().neq('id', 0),
      sb.from('import_log').delete().neq('id', 0),
      sb.from('name_aliases').delete().neq('id', 0),
      sb.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    ])
    setShowDeleteModal(false)
    setDeleteConfirm('')
    setClearError('')
    alert('All project data has been cleared.')
  }

  async function handleLogout() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const SavedBadge = ({ k }: { k: string }) =>
    saved === k ? (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 ml-2">
        <Check size={12} /> Saved
      </span>
    ) : null

  return (
    <div className="max-w-2xl space-y-4">
      {/* ── Company Branding ────────────────────────────────────────────────── */}
      <Section icon={Building2} title="Company Branding" defaultOpen>
        <Field label="Company Name" hint="Appears in report headers">
          <div className="flex items-center gap-2">
            <input
              value={settings.company_name}
              onChange={e => update('company_name', e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <SavedBadge k="company_name" />
          </div>
        </Field>
        <Field label="Primary Colour" hint="Accent colour used in reports">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.primary_color}
              onChange={e => update('primary_color', e.target.value)}
              className="w-10 h-9 rounded border border-slate-200 cursor-pointer p-0.5"
            />
            <input
              value={settings.primary_color}
              onChange={e => update('primary_color', e.target.value)}
              className="w-28 border border-slate-200 rounded-lg text-sm px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="#0d9488"
            />
            <div
              className="w-8 h-8 rounded-full border border-slate-200 shadow-sm"
              style={{ backgroundColor: settings.primary_color }}
            />
            <SavedBadge k="primary_color" />
          </div>
        </Field>
      </Section>

      {/* ── Currency & FX ────────────────────────────────────────────────────── */}
      <Section icon={DollarSign} title="Currency & FX">
        <Field label="Default Currency">
          <div className="flex gap-4">
            {(['SGD', 'USD'] as const).map(c => (
              <label key={c} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input type="radio" name="currency" value={c}
                  checked={settings.default_currency === c}
                  onChange={() => update('default_currency', c)}
                  className="accent-teal-600" />
                {c}
              </label>
            ))}
          </div>
        </Field>
        <Field label="SGD → IDR Rate" hint="Used for currency conversion in reports">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.usd_to_idr}
              onChange={e => update('usd_to_idr', e.target.value)}
              className="w-36 border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-xs text-slate-400">Manual rate — update periodically</span>
            <SavedBadge k="usd_to_idr" />
          </div>
        </Field>
      </Section>

      {/* ── Overhead ─────────────────────────────────────────────────────────── */}
      <Section icon={Gauge} title="Overhead">
        <Field label="Overhead Method" hint="How overhead is applied to projects">
          <div className="flex flex-col gap-1.5">
            {([
              ['logged', 'Logged Expenses — use overhead expense entries only'],
              ['computed', 'Computed % — apply % of labour cost as overhead'],
              ['both', 'Both — MAX of logged expenses and computed %'],
            ] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input type="radio" name="overheadMethod" value={v}
                  checked={settings.overhead_method === v}
                  onChange={() => update('overhead_method', v)}
                  className="accent-teal-600" />
                {l}
              </label>
            ))}
          </div>
        </Field>
        {(settings.overhead_method === 'computed' || settings.overhead_method === 'both') && (
          <Field label="Default Rate %" hint="Applied to labour cost per project">
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max="100" step="0.1"
                value={settings.overhead_rate_pct}
                onChange={e => update('overhead_rate_pct', e.target.value)}
                className="w-24 border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-sm text-slate-500">%</span>
              <SavedBadge k="overhead_rate_pct" />
            </div>
          </Field>
        )}
      </Section>

      {/* ── Data Management ──────────────────────────────────────────────────── */}
      <Section icon={Database} title="Data Management">
        <div className="space-y-3">
          {/* Export */}
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div>
              <p className="text-sm text-slate-700">Export JSON Backup</p>
              <p className="text-xs text-slate-400">Download all data as a JSON file</p>
            </div>
            <button
              onClick={handleExportJson}
              className="px-3 py-1.5 text-sm border border-teal-600 text-teal-700 rounded-lg hover:bg-teal-50 font-medium transition-colors"
            >
              Export
            </button>
          </div>

          {/* Import */}
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div>
              <p className="text-sm text-slate-700">Import JSON Backup</p>
              <p className="text-xs text-slate-400">Restore from a previously exported backup</p>
            </div>
            <button
              onClick={() => importRef.current?.click()}
              className="px-3 py-1.5 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium transition-colors"
            >
              Import
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />
          </div>

          {/* Clear all data */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-red-600 font-medium">Clear All Data</p>
              <p className="text-xs text-slate-400">Permanently deletes all projects, timesheets, and expenses</p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors"
            >
              Clear Data
            </button>
          </div>
        </div>
      </Section>

      {/* ── Account ──────────────────────────────────────────────────────────── */}
      <Section icon={LogOut} title="Account">
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm text-slate-700">Sign Out</p>
            <p className="text-xs text-slate-400">Sign out of your PS Global account</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </Section>

      {/* ── Clear all modal ───────────────────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="text-red-500 mt-0.5 flex-shrink-0" size={20} />
              <div>
                <h3 className="text-base font-semibold text-slate-800">Clear All Data</h3>
                <p className="text-sm text-slate-600 mt-1">
                  This will permanently delete all projects, timesheet entries, expense entries, and import history. This cannot be undone.
                </p>
              </div>
            </div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              value={deleteConfirm}
              onChange={e => { setDeleteConfirm(e.target.value); setClearError('') }}
              placeholder="DELETE"
              className="w-full border border-slate-300 rounded-lg text-sm px-3 py-2 mb-1 focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
            />
            {clearError && <p className="text-xs text-red-500 mb-3">{clearError}</p>}
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setClearError('') }}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
