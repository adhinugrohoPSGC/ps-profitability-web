// Single source of truth for date formatting across the app.
// Target display format: dd/MMM/yyyy  (e.g. 09/Jul/2026)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDate(v: string | number | Date): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === 'number') { const d = new Date(v); return isNaN(d.getTime()) ? null : d }
  const s = String(v).trim()
  if (!s) return null
  // yyyy-MM-dd (optionally followed by time) → parse as LOCAL date to avoid TZ off-by-one
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // epoch millis as a string
  if (/^\d{10,}$/.test(s)) { const d = new Date(Number(s)); return isNaN(d.getTime()) ? null : d }
  const t = Date.parse(s)
  return isNaN(t) ? null : new Date(t)
}

// Returns "dd/MMM/yyyy", "—" for empty, or the original string if unparseable.
export function fmtDate(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const d = toDate(v)
  if (!d) return typeof v === 'string' ? v : '—'
  return `${String(d.getDate()).padStart(2, '0')}/${MONTHS[d.getMonth()]}/${d.getFullYear()}`
}

// "dd/MMM/yyyy HH:mm" — for timestamps like "last updated".
export function fmtDateTime(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const d = toDate(v)
  if (!d) return typeof v === 'string' ? v : '—'
  const base = `${String(d.getDate()).padStart(2, '0')}/${MONTHS[d.getMonth()]}/${d.getFullYear()}`
  return `${base} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
