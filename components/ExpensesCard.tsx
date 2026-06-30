'use client'

import { useState, useCallback, useEffect, DragEvent } from 'react'
import {
  Upload as UploadIcon, DollarSign,
  CheckCircle, AlertTriangle, X, Download, ChevronDown, ChevronUp,
  Loader2,
} from 'lucide-react'
import { useToast } from '@/components/Toast'
import {
  parseExpensesXLS, generateExpensesTemplate,
  type ExpenseRow,
} from '@/lib/parseTemplates'
import Modal from '@/components/Modal'
import { createClient } from '@/lib/supabase/client'
import { useRef } from 'react'

const ANON_USER_ID = '00000000-0000-0000-0000-000000000001'

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

// ══════════════════════════════════════════════════════════════════════════════
// Card B — Expenses
// ══════════════════════════════════════════════════════════════════════════════

export default function ExpensesCard({ selectedProject, hideProjectWarning }: { selectedProject: string | null; hideProjectWarning?: boolean }) {
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
          project_id: selectedProject,
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
        user_id: ANON_USER_ID,
      })
      toast(`Imported ${entries.length} expense entries`, 'success')
      setRows([]); setFileName(''); setWarnings([]); setTotals({})
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err)
      toast(`Import failed: ${msg}`, 'error')
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
