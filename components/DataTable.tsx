'use client'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react'

const MIN_COL_WIDTH = 56

export interface DataColumn<T> {
  key: string
  label: string
  width: number
  align?: 'right' | 'center'
  sortValue?: (r: T) => string | number | null
  render: (r: T, i: number) => ReactNode
}

type Props<T> = {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (r: T) => string | number
  footer?: ReactNode
  rowCap?: number
}

export default function DataTable<T>({ columns, rows, rowKey, footer, rowCap = 100 }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map(c => [c.key, c.width])))
  const [showAll, setShowAll] = useState(false)
  const resizing = useRef(false)

  const sorted = useMemo(() => {
    const col = sort && columns.find(c => c.key === sort.key)
    if (!col?.sortValue) return rows
    const dir = sort!.dir
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a), vb = col.sortValue!(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1 // nulls last regardless of direction
      if (vb == null) return -1
      if (va < vb) return -dir
      if (va > vb) return dir
      return 0
    })
  }, [rows, sort, columns])

  const display = showAll ? sorted : sorted.slice(0, rowCap)
  const tableWidth = columns.reduce((s, c) => s + (widths[c.key] ?? c.width), 0)

  function toggleSort(key: string) {
    setSort(s => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))
  }

  function startResize(e: React.MouseEvent, key: string) {
    e.preventDefault(); e.stopPropagation()
    resizing.current = true
    const startX = e.clientX
    const startW = widths[key]
    function move(ev: MouseEvent) {
      setWidths(w => ({ ...w, [key]: Math.max(MIN_COL_WIDTH, startW + ev.clientX - startX) }))
    }
    function up() {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      setTimeout(() => { resizing.current = false }, 0)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: 'fixed', width: tableWidth }}>
          <colgroup>
            {columns.map(c => <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />)}
          </colgroup>
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
            <tr>
              {columns.map(c => {
                const isSorted = sort?.key === c.key && !!c.sortValue
                const alignCls = c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                return (
                  <th
                    key={c.key}
                    aria-sort={isSorted ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                    className={`relative px-3 py-2.5 font-medium whitespace-nowrap select-none ${alignCls}`}
                  >
                    {c.sortValue ? (
                      <button
                        onClick={() => { if (!resizing.current) toggleSort(c.key) }}
                        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 ${isSorted ? 'text-teal-600' : ''}`}
                      >
                        {c.label}
                        {isSorted && (sort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </button>
                    ) : c.label}
                    <span
                      onMouseDown={e => startResize(e, c.key)}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-teal-300/60"
                      aria-hidden="true"
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {display.map((r, i) => (
              <tr key={rowKey(r)} className="hover:bg-slate-50/50">
                {columns.map(c => {
                  const alignCls = c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
                  return (
                    <td key={c.key} className={`px-3 py-2 overflow-hidden ${alignCls}`}>
                      {c.render(r, i)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-semibold text-slate-700">
              {footer}
            </tfoot>
          )}
        </table>
      </div>
      {sorted.length > rowCap && (
        <div className="px-4 py-3 border-t border-slate-100">
          <button onClick={() => setShowAll(v => !v)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {sorted.length} rows</>}
          </button>
        </div>
      )}
    </>
  )
}
