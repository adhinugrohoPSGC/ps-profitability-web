'use client'

import { useState, useRef, useCallback, useEffect, DragEvent } from 'react'
import {
  Upload as UploadIcon, FileText, DollarSign, Building2,
  CheckCircle, AlertTriangle, X, Download, ChevronDown, ChevronUp,
  Loader2, RefreshCw
} from 'lucide-react'
import { useToast } from '@/components/Toast'
import {
  parseTimesheetXLS, parseExpensesXLS, parseProjectInfoXLS,
  generateTimesheetTemplate, generateExpensesTemplate, generateProjectInfoTemplate,
  type TimesheetRow, type ExpenseRow, type ProjectInfoData,
} from '@/lib/parseTemplates'
import { findBestMatches, type MatchResult } from '@/lib/fuzzyMatch'
import Modal from '@/components/Modal'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'

// ── Types ──────────────────────────────────────────────────────────────────

interface RateCardEntry {
  id: number
  consultant_name: string
  role: string
  cost_rate_sgd: number
  bill_rate_sgd: number
}

interface NameAlias {
  alias: string
  rate_card_id: number
  resolved_name: string
}

interface ResolvedRow extends TimesheetRow {
  _rateCardId: number | null
  _matchStatus: 'matched' | 'alias' | 'needs_review' | 'unmatched'
  _candidates: MatchResult[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function downloadBlob(buf: ArrayBuffer, filename: string) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function batchId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n)
}

// ── Drop Zone ──────────────────────────────────────────────────────────────

function DropZone({ onFile, loading, hasFile }: { onFile: (buf: ArrayBuffer, name: string) => void; loading: boolean; hasFile: boolean }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { if (ev.target?.result) onFile(ev.target.result as ArrayBuffer, file.name) }
    reader.readAsArrayBuffer(file)
  }, [onFile])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { if (ev.target?.result) onFile(ev.target.result as ArrayBuffer, file.name) }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleBrowse = () => {
    inputRef.current?.click()
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={hasFile ? undefined : handleBrowse}
      className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-6 px-4 transition-colors cursor-pointer select-none
        ${dragging ? 'border-blue-400 bg-blue-50' : hasFile ? 'border-green-300 bg-green-50 cursor-default' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40'}`}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
      {loading ? (
        <Loader2 className="animate-spin text-blue-500 mb-2" size={28} />
      ) : hasFile ? (
        <CheckCircle className="text-green-500 mb-2" size={28} />
      ) : (
        <UploadIcon className={`mb-2 ${dragging ? 'text-blue-500' : 'text-slate-300'}`} size={28} />
      )}
      <p className="text-sm font-medium text-slate-600">
        {loading ? 'Parsing…' : hasFile ? 'File loaded' : dragging ? 'Drop to upload' : 'Drop Excel file or click to browse'}
      </p>
      {!hasFile && !loading && (
        <p className="text-xs text-slate-400 mt-1">.xlsx / .xls</p>
      )}
    </div>
  )
}

// ── Card shell ─────────────────────────────────────────────────────────────

function Card({ icon, title, description, onDownloadTemplate, children }: {
  icon: React.ReactNode; title: string; description: string
  onDownloadTemplate: () => void; children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
          <p className="text-xs text-slate-400 truncate">{description}</p>
        </div>
        <button
          onClick={onDownloadTemplate}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-2.5 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors mr-2 whitespace-nowrap"
        >
          <Download size={12} />
          Blank Template
        </button>
        <button onClick={() => setExpanded(v => !v)} className="text-slate-400 hover:text-slate-600">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expanded && <div className="px-6 py-5">{children}</div>}
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'matched' | 'alias' | 'needs_review' | 'unmatched' }) {
  const map = {
    matched: { color: 'bg-green-100 text-green-700', label: 'Matched' },
    alias: { color: 'bg-green-100 text-green-700', label: 'Alias' },
    needs_review: { color: 'bg-amber-100 text-amber-700', label: 'Needs review' },
    unmatched: { color: 'bg-red-100 text-red-700', label: 'Unmatched' },
  }
  const { color, label } = map[status]
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
}

// ══════════════════════════════════════════════════════════════════════════════
// Card A — Timesheet
// ══════════════════════════════════════════════════════════════════════════════

function TimesheetCard({ selectedProject }: { selectedProject: string | null }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ResolvedRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [rateCards, setRateCards] = useState<RateCardEntry[]>([])
  const [aliases, setAliases] = useState<NameAlias[]>([])
  const [resolutions, setResolutions] = useState<Record<number, number | null>>({}) // rowIdx -> rateCardId
  const [confirming, setConfirming] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [fxRate, setFxRate] = useState(15000)
  const [projectIdMap, setProjectIdMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const sb = createClient()
    sb.from('rate_card')
      .select('id, consultant_name, role, cost_rate_sgd, bill_rate_sgd')
      .eq('active', true)
      .is('effective_to', null)
      .then(({ data }) => setRateCards((data ?? []) as RateCardEntry[]))
    sb.from('name_aliases')
      .select('alias, rate_card_id, rate_card(consultant_name)')
      .then(({ data }) => {
        setAliases((data ?? []).map((a: Record<string, unknown>) => ({
          alias: a.alias as string,
          rate_card_id: a.rate_card_id as number,
          resolved_name: (a.rate_card as { consultant_name: string } | null)?.consultant_name ?? '',
        })))
      })
    sb.from('user_settings').select('key, value').then(({ data }) => {
      const s = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
      if (s['usd_to_idr']) setFxRate(Number(s['usd_to_idr']))
    })
  }, [])

  const resolveRows = useCallback((parsed: TimesheetRow[], rc: RateCardEntry[], al: NameAlias[]): ResolvedRow[] => {
    return parsed.map((row) => {
      const nameLc = row.consultant_name.toLowerCase().trim()
      // 1. Exact match
      const exact = rc.find(r => r.consultant_name.toLowerCase().trim() === nameLc)
      if (exact) return { ...row, _rateCardId: exact.id, _matchStatus: 'matched', _candidates: [] }
      // 2. Alias match
      const alias = al.find(a => a.alias.toLowerCase().trim() === nameLc)
      if (alias) return { ...row, _rateCardId: alias.rate_card_id, _matchStatus: 'alias', _candidates: [] }
      // 3. Fuzzy match
      const candidates = findBestMatches(row.consultant_name, rc)
      const best = candidates[0]
      if (best && best.score >= 0.8) {
        return { ...row, _rateCardId: best.id, _matchStatus: 'needs_review', _candidates: candidates }
      }
      return { ...row, _rateCardId: null, _matchStatus: 'unmatched', _candidates: candidates }
    })
  }, [])

  const handleFile = useCallback(async (buf: ArrayBuffer, name: string) => {
    setLoading(true); setFileName(name)
    try {
      const { rows: parsed, warnings: w } = parseTimesheetXLS(buf, selectedProject ?? undefined)
      const sb = createClient()
      let rc = rateCards
      let al = aliases
      if (!rc.length) {
        const { data } = await sb.from('rate_card')
          .select('id, consultant_name, role, cost_rate_sgd, bill_rate_sgd')
          .eq('active', true)
          .is('effective_to', null)
        rc = (data ?? []) as RateCardEntry[]
        setRateCards(rc)
      }
      if (!al.length) {
        const { data } = await sb.from('name_aliases').select('alias, rate_card_id, rate_card(consultant_name)')
        al = (data ?? []).map((a: Record<string, unknown>) => ({
          alias: a.alias as string,
          rate_card_id: a.rate_card_id as number,
          resolved_name: (a.rate_card as { consultant_name: string } | null)?.consultant_name ?? '',
        }))
        setAliases(al)
      }
      const { data: projectData } = await sb.from('projects').select('id, external_id').not('external_id', 'is', null)
      setProjectIdMap(Object.fromEntries(
        ((projectData ?? []) as { id: string; external_id: string }[]).map(p => [p.external_id, p.id])
      ))

      const resolved = resolveRows(parsed, rc, al)
      setRows(resolved)
      setWarnings(w)
      setResolutions({})
    } catch (err) {
      toast(`Parse error: ${String(err)}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedProject, rateCards, aliases, resolveRows, toast])

  const getEffectiveRateCardId = (row: ResolvedRow, idx: number): number | null => {
    if (resolutions[idx] !== undefined) return resolutions[idx]
    return row._rateCardId
  }

  const unresolvedCount = rows.filter((r, i) => {
    const rcId = getEffectiveRateCardId(r, i)
    return !rcId
  }).length

  const handleConfirmImport = async () => {
    if (!selectedProject) { toast('No project selected', 'warning'); return }
    const { data: dup } = await createClient()
      .from('import_log').select('id')
      .eq('filename', fileName).eq('project_id', selectedProject).maybeSingle()
    if (dup) { setConfirming(true); return }
    await doImport()
  }

  const doImport = async () => {
    setSaveLoading(true); setConfirming(false)
    const batch = batchId()
    try {
      const entries = rows.map((row, i) => {
        const rcId = getEffectiveRateCardId(row, i)
        const rc = rateCards.find(r => r.id === rcId)
        const hours = row.hours
        const costRate = rc?.cost_rate_sgd ?? 0
        const billRate = rc?.bill_rate_sgd ?? 0
        // Resolve external project ID to internal UUID, fall back to selected project
        const resolvedProjectId =
          (row.external_project_id && projectIdMap[row.external_project_id]) ||
          selectedProject
        return {
          project_id: resolvedProjectId,
          entry_date: row.entry_date,
          consultant_name: row.consultant_name,
          user_external_id: row.user_external_id || null,
          rate_card_id: rcId ?? null,
          task_description: row.task_description,
          phase: row.phase,
          hours,
          cost_rate_sgd: costRate,
          labour_cost_sgd: hours * costRate,
          bill_rate_sgd: billRate,
          billable_value_sgd: hours * billRate,
          import_batch_id: batch,
        }
      })
      const { error } = await createClient().from('timesheet_entries').insert(entries)
      if (error) throw error

      // Save any new alias resolutions
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rcId = resolutions[i]
        if ((row._matchStatus === 'needs_review' || row._matchStatus === 'unmatched') && rcId) {
          await createClient().from('name_aliases').upsert(
            { alias: row.consultant_name, rate_card_id: rcId },
            { onConflict: 'user_id,alias' }
          )
        }
      }

      await createClient().from('import_log').insert({
        batch_id: batch,
        project_id: selectedProject,
        template_type: 'timesheet',
        filename: fileName,
        rows_imported: entries.length,
        rows_skipped: warnings.length,
      })

      toast(`Imported ${entries.length} timesheet entries`, 'success')
      setRows([]); setFileName(''); setWarnings([])
    } catch (err) {
      toast(`Import failed: ${String(err)}`, 'error')
    } finally {
      setSaveLoading(false)
    }
  }

  const displayRows = showAll ? rows : rows.slice(0, 15)
  const totalHours = rows.reduce((s, r) => s + r.hours, 0)

  return (
    <Card
      icon={<FileText size={18} />}
      title="Timesheet Upload"
      description="Import consultant hours from Excel timesheet template"
      onDownloadTemplate={() => downloadBlob(generateTimesheetTemplate(), 'timesheet-template.xlsx')}
    >
      <DropZone onFile={handleFile} loading={loading} hasFile={rows.length > 0} />

      {rows.length > 0 && (
        <div className="mt-4 space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">{rows.length} rows</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">{totalHours.toFixed(1)} total hours</span>
            {unresolvedCount > 0 && (
              <>
                <span className="text-slate-400">|</span>
                <span className="text-amber-600 font-medium">{unresolvedCount} names need resolution</span>
              </>
            )}
            <button
              onClick={() => { setRows([]); setFileName(''); setWarnings([]) }}
              className="ml-auto text-slate-400 hover:text-red-500 flex items-center gap-1 text-xs"
            >
              <X size={12} /> Clear
            </button>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="flex-shrink-0" />{w}
                </p>
              ))}
            </div>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  {['Date', 'User ID', 'Consultant', 'Project', 'Hrs', 'Status', 'Resolve'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayRows.map((row, i) => {
                  const needsResolve = row._matchStatus === 'needs_review' || row._matchStatus === 'unmatched'
                  const effectiveId = getEffectiveRateCardId(row, i)
                  return (
                    <tr key={i} className={`${row._warnings.length > 0 ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.entry_date || '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{row.user_external_id || '—'}</td>
                      <td className="px-3 py-2 font-medium text-slate-800 max-w-[120px] truncate" title={row.consultant_name}>
                        {row.consultant_name || <span className="text-red-400 italic">missing</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap font-mono text-xs">
                        {row.external_project_id ? (
                          <span
                            className={projectIdMap[row.external_project_id] ? 'text-green-600' : 'text-amber-600'}
                            title={projectIdMap[row.external_project_id] ?? selectedProject ?? undefined}
                          >
                            {row.external_project_id}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{row.hours}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={effectiveId ? (row._matchStatus === 'unmatched' ? 'needs_review' : row._matchStatus) : 'unmatched'} />
                        {row._warnings.map((w, wi) => (
                          <p key={wi} className="text-xs text-amber-600 mt-0.5">{w}</p>
                        ))}
                      </td>
                      <td className="px-3 py-2">
                        {needsResolve && (
                          <select
                            value={resolutions[i] ?? ''}
                            onChange={e => setResolutions(prev => ({ ...prev, [i]: Number(e.target.value) || null }))}
                            className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white max-w-[160px]"
                          >
                            <option value="">— Select consultant —</option>
                            {row._candidates.length > 0 && (
                              <optgroup label="Best matches">
                                {row._candidates.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} ({Math.round(c.score * 100)}%)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="All consultants">
                              {rateCards.map(rc => (
                                <option key={rc.id} value={rc.id}>{rc.consultant_name}</option>
                              ))}
                            </optgroup>
                          </select>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {rows.length > 15 && (
            <button onClick={() => setShowAll(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {rows.length} rows</>}
            </button>
          )}

          {/* Confirm button */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              {unresolvedCount > 0 ? `${unresolvedCount} rows will be saved without a rate card link` : 'All consultants matched — ready to import'}
            </p>
            <button
              onClick={handleConfirmImport}
              disabled={saveLoading || !selectedProject}
              className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Confirm Import ({rows.length} rows)
            </button>
          </div>
        </div>
      )}

      {/* Duplicate warning modal */}
      <Modal open={confirming} title="Duplicate Import Detected" onClose={() => setConfirming(false)}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              The file <strong>{fileName}</strong> has been imported before for this project. Importing again will add duplicate entries.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setConfirming(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
            <button onClick={doImport} className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700">Import Anyway</button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Card B — Expenses
// ══════════════════════════════════════════════════════════════════════════════

function ExpensesCard({ selectedProject }: { selectedProject: string | null }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [confirming, setConfirming] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [fxRate, setFxRate] = useState(15000)

  useEffect(() => {
    createClient().from('user_settings').select('key, value').then(({ data }) => {
      const s = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
      if (s['usd_to_idr']) setFxRate(Number(s['usd_to_idr']))
    })
  }, [])

  const handleFile = useCallback(async (buf: ArrayBuffer, name: string) => {
    setLoading(true); setFileName(name)
    try {
      const { rows: parsed, warnings: w, totalByCategory } = parseExpensesXLS(buf, selectedProject ?? undefined, fxRate)
      setRows(parsed); setWarnings(w); setTotals(totalByCategory)
    } catch (err) {
      toast(`Parse error: ${String(err)}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedProject, fxRate, toast])

  const handleConfirmImport = async () => {
    if (!selectedProject) { toast('No project selected', 'warning'); return }
    const { data: dup } = await createClient()
      .from('import_log').select('id')
      .eq('filename', fileName).eq('project_id', selectedProject).maybeSingle()
    if (dup) { setConfirming(true); return }
    await doImport()
  }

  const doImport = async () => {
    setSaveLoading(true); setConfirming(false)
    const batch = batchId()
    try {
      const entries = rows.map(row => {
        const amountSgd = row.currency === 'SGD' ? row.amount_native : row.currency === 'IDR' ? row.amount_native / fxRate : row.amount_native
        return {
          project_id: row.project_id || selectedProject,
          expense_date: row.expense_date,
          category: row.category,
          description: row.description,
          vendor: row.vendor,
          amount_native: row.amount_native,
          currency: row.currency,
          fx_rate: row.currency === 'IDR' ? fxRate : 1,
          amount_sgd: amountSgd,
          paid_by: row.paid_by,
          receipted: row.receipted,
          notes: row.notes,
          import_batch_id: batch,
        }
      })
      const { error } = await createClient().from('expense_entries').insert(entries)
      if (error) throw error
      await createClient().from('import_log').insert({
        batch_id: batch,
        project_id: selectedProject,
        template_type: 'expenses',
        filename: fileName,
        rows_imported: entries.length,
        rows_skipped: warnings.length,
      })
      toast(`Imported ${entries.length} expense entries`, 'success')
      setRows([]); setFileName(''); setWarnings([]); setTotals({})
    } catch (err) {
      toast(`Import failed: ${String(err)}`, 'error')
    } finally {
      setSaveLoading(false)
    }
  }

  const displayRows = showAll ? rows : rows.slice(0, 15)
  const totalRows = rows.reduce((s, r) => {
    const sgd = r.currency === 'SGD' ? r.amount_native : r.currency === 'IDR' ? r.amount_native / fxRate : r.amount_native
    return s + sgd
  }, 0)
  const rowWarnings = rows.filter(r => r._warnings.length > 0).length

  return (
    <Card
      icon={<DollarSign size={18} />}
      title="Expenses Upload"
      description="Import project expense claims from Excel expenses template"
      onDownloadTemplate={() => downloadBlob(generateExpensesTemplate(), 'expenses-template.xlsx')}
    >
      <DropZone onFile={handleFile} loading={loading} hasFile={rows.length > 0} />

      {rows.length > 0 && (
        <div className="mt-4 space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-slate-500">{rows.length} rows</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">Total ≈ {fmt(totalRows, 'SGD')} SGD</span>
            {rowWarnings > 0 && (
              <>
                <span className="text-slate-400">|</span>
                <span className="text-amber-600 font-medium">{rowWarnings} rows with warnings</span>
              </>
            )}
            <button
              onClick={() => { setRows([]); setFileName(''); setWarnings([]); setTotals({}) }}
              className="ml-auto text-slate-400 hover:text-red-500 flex items-center gap-1 text-xs"
            >
              <X size={12} /> Clear
            </button>
          </div>

          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="flex-shrink-0" />{w}
                </p>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  {['Date', 'Category', 'Description', 'Vendor', 'Amount', 'CCY', 'Rcpt', 'Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayRows.map((row, i) => (
                  <tr key={i} className={row._warnings.length > 0 ? 'bg-amber-50/30' : ''}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.expense_date || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.category || <span className="text-red-400 italic">none</span>}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate text-slate-500" title={row.description}>{row.description || '—'}</td>
                    <td className="px-3 py-2 max-w-[120px] truncate text-slate-500" title={row.vendor}>{row.vendor || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">{row.amount_native.toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-500">{row.currency}</td>
                    <td className="px-3 py-2 text-center">
                      {row.receipted ? <CheckCircle size={12} className="text-green-500 mx-auto" /> : <X size={12} className="text-slate-300 mx-auto" />}
                    </td>
                    <td className="px-3 py-2">
                      {row._warnings.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <AlertTriangle size={10} />{row._warnings.length} warn
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 15 && (
            <button onClick={() => setShowAll(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {rows.length} rows</>}
            </button>
          )}

          {/* Total by category */}
          {Object.keys(totals).length > 0 && (
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Totals by Category (SGD equiv.)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(totals).map(([cat, amt]) => (
                  <div key={cat} className="flex items-center justify-between gap-2 bg-white rounded px-3 py-1.5 border border-slate-100">
                    <span className="text-xs text-slate-600 truncate">{cat}</span>
                    <span className="text-xs font-mono font-semibold text-slate-800 whitespace-nowrap">{fmt(amt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-400">Using IDR/SGD rate: {fxRate.toLocaleString()}</p>
            <button
              onClick={handleConfirmImport}
              disabled={saveLoading || !selectedProject}
              className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Confirm Import ({rows.length} rows)
            </button>
          </div>
        </div>
      )}

      <Modal open={confirming} title="Duplicate Import Detected" onClose={() => setConfirming(false)}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              The file <strong>{fileName}</strong> has been imported before. Importing again will add duplicate entries.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setConfirming(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
            <button onClick={doImport} className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700">Import Anyway</button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Card C — Project Info
// ══════════════════════════════════════════════════════════════════════════════

function ProjectInfoCard({ onProjectImported }: { onProjectImported?: (id: string) => void }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [data, setData] = useState<ProjectInfoData | null>(null)
  const [existingProject, setExistingProject] = useState<Record<string, unknown> | null>(null)
  const [conflictModal, setConflictModal] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [mergeMode, setMergeMode] = useState<'overwrite' | 'merge'>('overwrite')

  const handleFile = useCallback(async (buf: ArrayBuffer, name: string) => {
    setLoading(true); setFileName(name)
    try {
      const parsed = parseProjectInfoXLS(buf)
      setData(parsed)
      // Find existing project by name (UUID-based, not user-typed id)
      const { data: existing } = await createClient()
        .from('projects').select('*').eq('name', parsed.name).maybeSingle()
      setExistingProject(existing ?? null)
    } catch (err) {
      toast(`Parse error: ${String(err)}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const handleConfirmImport = () => {
    if (!data) return
    if (existingProject) { setConflictModal(true); return }
    doImport('overwrite')
  }

  const doImport = async (mode: 'overwrite' | 'merge') => {
    if (!data) return
    setSaveLoading(true); setConflictModal(false)
    try {
      // Do NOT include the id from parseProjectInfoXLS — that's a generated string like PRJ-xxx
      // PostgreSQL assigns the UUID
      const projectData = {
        name: data.name, client_name: data.client_name,
        project_manager: data.project_manager, start_date: data.start_date, end_date: data.end_date,
        contract_value: data.contract_value, contract_currency: data.contract_currency,
        billing_type: data.billing_type, phases: data.phases,
        overhead_rate_pct: data.overhead_rate_pct, status: 'active', notes: data.notes,
      }

      let savedId: string | null = null

      if (mode === 'merge' && existingProject) {
        const merged: Record<string, unknown> = { ...existingProject }
        for (const [k, v] of Object.entries(projectData)) {
          if (v !== '' && v !== 0 && v !== null && v !== undefined) merged[k] = v
        }
        // Remove id from merged payload to avoid conflicts
        const { id: _id, ...mergedWithoutId } = merged as { id: unknown } & Record<string, unknown>
        void _id
        const { data: updated } = await createClient()
          .from('projects').update(mergedWithoutId).eq('id', existingProject.id as string).select('id').single()
        savedId = (updated as { id: string } | null)?.id ?? null
      } else if (existingProject) {
        const { data: updated } = await createClient()
          .from('projects').update(projectData).eq('id', existingProject.id as string).select('id').single()
        savedId = (updated as { id: string } | null)?.id ?? null
      } else {
        const { data: newProj } = await createClient()
          .from('projects').insert(projectData).select('id').single()
        savedId = (newProj as { id: string } | null)?.id ?? null
      }

      const targetId = savedId
      if (targetId && data.budget_lines.length > 0) {
        await createClient().from('project_budget').delete().eq('project_id', targetId)
        await createClient().from('project_budget').insert(
          data.budget_lines.map(l => ({ ...l, project_id: targetId }))
        )
      }

      toast(`Project "${data.name}" saved successfully`, 'success')
      if (targetId) onProjectImported?.(targetId)
      setData(null); setFileName(''); setExistingProject(null)
    } catch (err) {
      toast(`Import failed: ${String(err)}`, 'error')
    } finally {
      setSaveLoading(false)
    }
  }

  const kv: [string, string][] = data ? [
    ['Project ID', data.id],
    ['Project Name', data.name],
    ['Client', data.client_name],
    ['Project Manager', data.project_manager],
    ['Start Date', data.start_date],
    ['End Date', data.end_date],
    ['Contract Value', data.contract_value ? fmt(data.contract_value, data.contract_currency || 'USD') : '—'],
    ['Billing Type', data.billing_type],
    ['Phases', data.phases],
    ['Overhead Rate', data.overhead_rate_pct ? `${data.overhead_rate_pct}%` : '—'],
    ['Notes', data.notes || '—'],
  ] : []

  return (
    <Card
      icon={<Building2 size={18} />}
      title="Project Info Upload"
      description="Import project metadata and budget plan from Excel project template"
      onDownloadTemplate={() => downloadBlob(generateProjectInfoTemplate(), 'project-info-template.xlsx')}
    >
      <DropZone onFile={handleFile} loading={loading} hasFile={data !== null} />

      {data && (
        <div className="mt-4 space-y-4">
          {/* Existing project warning */}
          {existingProject && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Project <strong>{data.name}</strong> already exists in the database. You can overwrite it or merge (only non-blank fields update).
              </p>
            </div>
          )}

          {/* Key-value preview */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {kv.map(([k, v]) => (
                  <tr key={k} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-500 w-44 whitespace-nowrap">{k}</td>
                    <td className="px-4 py-2.5 text-slate-800">{v || <span className="text-slate-300 italic">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Budget lines */}
          {data.budget_lines.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Budget Lines ({data.budget_lines.length})</p>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                    <tr>
                      {['Phase', 'Budgeted Hours', 'Budgeted Cost', 'Budgeted Revenue'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.budget_lines.map((bl, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-slate-700">{bl.phase}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{bl.budgeted_hours}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(bl.budgeted_cost)}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(bl.budgeted_revenue)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2 text-slate-600">Total</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">
                        {data.budget_lines.reduce((s, l) => s + l.budgeted_hours, 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">
                        {fmt(data.budget_lines.reduce((s, l) => s + l.budgeted_cost, 0))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">
                        {fmt(data.budget_lines.reduce((s, l) => s + l.budgeted_revenue, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              onClick={() => { setData(null); setFileName(''); setExistingProject(null) }}
              className="text-slate-400 hover:text-red-500 flex items-center gap-1 text-xs"
            >
              <X size={12} /> Clear
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={saveLoading}
              className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {existingProject ? 'Review & Save' : 'Confirm Import'}
            </button>
          </div>
        </div>
      )}

      {/* Conflict resolution modal */}
      <Modal open={conflictModal} title={`Project "${data?.name}" Already Exists`} onClose={() => setConflictModal(false)} maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Choose how to handle the conflict with the existing project record.
          </p>
          <div className="space-y-2">
            {(['overwrite', 'merge'] as const).map((mode) => (
              <label key={mode} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${mergeMode === mode ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="mode" value={mode} checked={mergeMode === mode} onChange={() => setMergeMode(mode)} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-800 capitalize">{mode}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {mode === 'overwrite'
                      ? 'Replace all fields in the existing project with the uploaded values.'
                      : 'Only update fields that have a value in the upload; keep existing values for blank fields.'}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setConflictModal(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
            <button onClick={() => doImport(mergeMode)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
              {saveLoading && <Loader2 size={14} className="animate-spin" />}
              {mergeMode === 'overwrite' ? 'Overwrite' : 'Merge'}
            </button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Upload page
// ══════════════════════════════════════════════════════════════════════════════

export default function UploadPage() {
  const { selectedProject, setSelectedProject } = useProject()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  const loadProjects = useCallback(async () => {
    const { data } = await createClient().from('projects').select('id, name').order('name')
    setProjects(data ?? [])
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const selectedName = projects.find(p => p.id === selectedProject)?.name

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Project selector banner */}
      <div className={`flex items-center gap-4 px-5 py-3.5 rounded-xl border ${selectedProject ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedProject ? (
            <>
              <CheckCircle size={16} className="text-blue-500 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                Importing into <strong>{selectedName ?? selectedProject}</strong>
              </p>
            </>
          ) : (
            <>
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-800">Select a project to import data into</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <label className="text-xs text-slate-500 whitespace-nowrap">Project:</label>
          <select
            value={selectedProject ?? ''}
            onChange={e => setSelectedProject(e.target.value || null)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">— Choose project —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={loadProjects}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded hover:bg-white"
            title="Refresh project list"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Upload cards */}
      <TimesheetCard selectedProject={selectedProject} />
      <ExpensesCard selectedProject={selectedProject} />
      <ProjectInfoCard onProjectImported={(id) => {
        setSelectedProject(id)
        loadProjects()
      }} />
    </div>
  )
}
