import type { FacetOption } from '@/components/MultiSelect'

export interface FacetDef<T> {
  key: string
  label: string
  get: (r: T) => string | null | undefined
}

/**
 * Cascading (faceted) filtering: each facet's options are computed from the
 * rows that pass the search box and every OTHER facet, so menus narrow each
 * other without ever locking themselves.
 */
export function buildFacets<T>(
  rows: T[],
  defs: FacetDef<T>[],
  selected: Record<string, string[]>,
  search: string,
  searchFields: (r: T) => (string | null | undefined)[],
) {
  const q = search.trim().toLowerCase()

  const matches = (r: T, ignore?: string) => {
    for (const d of defs) {
      if (d.key === ignore) continue
      const sel = selected[d.key]
      if (sel?.length && !sel.includes(d.get(r) ?? '')) return false
    }
    if (!q) return true
    return searchFields(r).some(v => v?.toLowerCase().includes(q))
  }

  const options: Record<string, FacetOption[]> = {}
  for (const d of defs) {
    const counts = new Map<string, number>()
    for (const r of rows) {
      const v = d.get(r)
      if (v && matches(r, d.key)) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    for (const v of selected[d.key] ?? []) if (!counts.has(v)) counts.set(v, 0)
    options[d.key] = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }

  return { matches, options, filtered: rows.filter(r => matches(r)) }
}
