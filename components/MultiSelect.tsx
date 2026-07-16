'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'

export interface FacetOption {
  value: string
  count: number
}

type Props = {
  label: string
  options: FacetOption[]
  selected: string[]
  onChange: (values: string[]) => void
}

export default function MultiSelect({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const shown = q ? options.filter(o => o.value.toLowerCase().includes(q)) : options
  const shortLabel = label.replace(/^All /, '')

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v])
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 whitespace-nowrap ${
          selected.length ? 'border-teal-500 text-teal-700 font-medium' : 'border-slate-200 text-slate-600'
        }`}
      >
        {selected.length ? `${shortLabel} · ${selected.length}` : label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-80 bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{shortLabel}</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-xs text-teal-600 hover:underline">
                Clear ({selected.length})
              </button>
            )}
          </div>
          {options.length > 8 && (
            <div className="relative px-3 py-2 border-b border-slate-100">
              <Search size={12} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter options…"
                className="w-full text-xs border border-slate-200 rounded-md pl-6 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}
          <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-400 text-center">No matching options</li>
            ) : shown.map(o => {
              const isSel = selected.includes(o.value)
              return (
                <li key={o.value} role="option" aria-selected={isSel}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                  >
                    <span className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      isSel ? 'bg-teal-500 border-teal-500' : 'border-slate-300'
                    }`}>
                      {isSel && <Check size={10} className="text-white" />}
                    </span>
                    <span className={`flex-1 truncate ${isSel ? 'text-slate-800 font-medium' : 'text-slate-600'}`} title={o.value}>
                      {o.value}
                    </span>
                    <span className="text-slate-400 tabular-nums">{o.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
