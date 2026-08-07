'use client'

// One chart language for the whole app: soft dashed gridlines, no axis rules,
// muted ticks, rounded bar caps and a dark pill tooltip. Import these instead
// of restyling each chart, so every surface stays consistent.

export const CHART_PALETTE = [
  '#10b981', // green — primary
  '#fbbf24', // amber
  '#6366f1', // indigo
  '#38bdf8', // sky
  '#f472b6', // pink
  '#a78bfa', // violet
  '#2dd4bf', // teal
  '#fb923c', // orange
]

export const CHART_POSITIVE = '#10b981'
export const CHART_NEGATIVE = '#f43f5e'
export const CHART_MUTED = '#cbd5e1'

/** <CartesianGrid {...CHART_GRID} /> */
export const CHART_GRID = {
  strokeDasharray: '4 6',
  vertical: false,
  stroke: '#eceff1',
} as const

/** <XAxis {...CHART_AXIS} /> — spread first, then add dataKey/formatters. */
export const CHART_AXIS = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11, fill: '#94a3b8' },
  dy: 4,
} as const

/** Hover wash behind bars, in place of the default grey block. */
export const CHART_CURSOR = { fill: 'rgba(16, 185, 129, 0.06)', radius: 8 }

/** Rounded bar caps. */
export const BAR_RADIUS: [number, number, number, number] = [8, 8, 0, 0]

interface TooltipItem {
  name?: string
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

/**
 * Dark pill tooltip. Pass `format` to render the value and optionally `sub`
 * to add a second, quieter line built from the row.
 *   <Tooltip content={<ChartTooltip format={fmt} />} cursor={CHART_CURSOR} />
 */
export function ChartTooltip({ active, payload, label, format, sub }: {
  active?: boolean
  payload?: TooltipItem[]
  label?: string | number
  format?: (v: number) => string
  sub?: (row: Record<string, unknown>) => string | null | undefined
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const raw = Number(item?.value ?? 0)
  const value = format ? format(raw) : raw.toLocaleString()
  const subtitle = sub?.(item?.payload ?? {})
  return (
    <div className="rounded-xl bg-slate-900/95 px-3 py-2 shadow-lg">
      {label !== undefined && label !== '' && (
        <p className="text-[11px] text-white/60 mb-0.5 max-w-[260px] truncate">{String(label)}</p>
      )}
      <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
      {subtitle && <p className="text-[11px] text-white/60 mt-0.5">{subtitle}</p>}
    </div>
  )
}

/** Dot + label legend row, matching the tooltip's quiet styling. */
export function ChartLegend({ items, onSelect }: {
  items: { name: string; color: string; value?: string }[]
  onSelect?: (name: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {items.map(i => {
        const body = (
          <>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: i.color }} />
            <span className="text-slate-500">{i.name}</span>
            {i.value && <span className="font-semibold text-slate-700 tabular-nums">{i.value}</span>}
          </>
        )
        return onSelect ? (
          <button key={i.name} onClick={() => onSelect(i.name)}
            className="flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity">
            {body}
          </button>
        ) : (
          <span key={i.name} className="flex items-center gap-1.5 text-xs">{body}</span>
        )
      })}
    </div>
  )
}
