'use client'
import type { LucideIcon } from 'lucide-react'

/**
 * The one KPI tile for the whole app. Six pages previously rendered their own
 * variant — four padding values, three value sizes, two label casings — so
 * figures never lined up when moving between surfaces.
 *
 * Pass `onClick` to make the tile a drill-down trigger; it then gets a real
 * hover state instead of only a pointer cursor.
 */
export default function KpiCard({ label, value, sub, icon: Icon, tint, valueClass, onClick, title }: {
  label: string
  value: string
  sub?: string
  icon?: LucideIcon
  /** Tailwind classes for the icon chip, e.g. 'bg-teal-50 text-teal-600'. */
  tint?: string
  valueClass?: string
  onClick?: () => void
  title?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-3">
        {Icon && (
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tint ?? 'bg-slate-100 text-slate-500'}`}>
            <Icon size={14} />
          </span>
        )}
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide truncate">{label}</p>
      </div>
      {/* tabular-nums so figures align digit-to-digit across a KPI row */}
      <p className={`text-2xl font-bold tabular-nums text-slate-800 ${valueClass ?? ''}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1 truncate" title={sub}>{sub}</p>}
    </>
  )

  const shell = 'bg-white rounded-xl border border-slate-200 px-5 py-4'

  if (!onClick) return <div className={shell}>{body}</div>

  return (
    <button
      onClick={onClick}
      title={title}
      className={`${shell} text-left w-full hover:border-teal-300 hover:shadow-card-hover transition-all cursor-pointer`}
    >
      {body}
    </button>
  )
}
