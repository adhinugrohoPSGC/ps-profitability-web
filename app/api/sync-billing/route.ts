export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

// Daily sync of billing_milestones from the PMO ERP Service Billing Milestone
// tracking Google Sheet, tab "A: Source Data".
const SHEET_ID = '18hMSVpqj4t6JTM_5Pu10aVw69dqI0EhVPqUtLn9zR1M'
const SHEET_TAB = 'A: Source Data'
const SHEET_GID = '249708663'

type Cell = string | number | null
type Grid = Cell[][]

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Excel/Sheets serial day → ISO date (both use the 1899-12-30 epoch)
function serialToIso(n: number): string | null {
  if (!isFinite(n) || n < 20000 || n > 60000) return null
  const ms = Math.round((n - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

function toIsoDate(v: Cell): string | null {
  if (v === null || v === '') return null
  if (typeof v === 'number') return serialToIso(v)
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // dd/MMM/yyyy or dd-MMM-yyyy
  let m = s.match(/^(\d{1,2})[/\- ]([A-Za-z]{3,})[/\- ](\d{4})$/)
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  // d/m/yyyy or m/d/yyyy — the PMO sheet uses day-first
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const a = parseInt(m[1]), b = parseInt(m[2])
    const [day, mon] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b] // ambiguous → day-first
    if (mon >= 1 && mon <= 12) return `${m[3]}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const t = Date.parse(s)
  return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

function toAmount(v: Cell): number | null {
  if (v === null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const n = parseFloat(String(v).replace(/[,$\s]/g, '').replace(/^\((.*)\)$/, '-$1'))
  return isFinite(n) ? n : null
}

function toText(v: Cell): string | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

// Minimal CSV parser with quoted-field support
function parseCsv(text: string): Grid {
  const rows: Grid = []
  let row: Cell[] = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

async function fetchViaOAuth(): Promise<Grid | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN ?? process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  })
  if (!tokenRes.ok) throw new Error(`Google token refresh failed (${tokenRes.status})`)
  const { access_token } = await tokenRes.json()

  const range = encodeURIComponent(`'${SHEET_TAB}'`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Sheets API failed (${res.status}): ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  return (json.values as Grid) ?? []
}

async function fetchViaPublicCsv(): Promise<Grid> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`
  const res = await fetch(url, { redirect: 'follow' })
  const text = await res.text()
  if (!res.ok || text.trimStart().startsWith('<')) {
    throw new Error('Sheet is not accessible: share it as "Anyone with the link (Viewer)" or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN (Sheets scope) in Vercel.')
  }
  return parseCsv(text)
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const grid = (await fetchViaOAuth()) ?? (await fetchViaPublicCsv())

    // Locate the header row (may not be row 1)
    const headerIdx = grid.findIndex(r => r.some(c => norm(c) === 'projectname'))
    if (headerIdx === -1) throw new Error('Header row with "Project Name" not found in the sheet')
    const headers = grid[headerIdx].map(norm)
    const col = (...names: string[]) => {
      for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i }
      return -1
    }
    const c = {
      owner: col('projectowner', 'owner'), country: col('country'),
      pm: col('projectmanager', 'pm'), name: col('projectname'),
      quote: col('quotationsource', 'quotation'), milestone: col('billingmilestone', 'milestone'),
      billStatus: col('billingstatus'), invStatus: col('invoicestatus'),
      quarter: col('quarter'), commitment: col('commitment'),
      baseline: col('baselinedate', 'baseline'), estimate: col('estimatedate', 'estimate'),
      invDate: col('invoicedate'), dueDate: col('invoiceduedate', 'duedate'),
      amount: col('amountsgd', 'amount'),
    }

    const rows = []
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i]
      const name = c.name >= 0 ? toText(r[c.name]) : null
      if (!name) continue
      rows.push({
        source_row: i + 1,
        project_owner: c.owner >= 0 ? toText(r[c.owner]) : null,
        country: c.country >= 0 ? toText(r[c.country]) : null,
        project_manager: c.pm >= 0 ? toText(r[c.pm]) : null,
        project_name: name,
        quotation_source: c.quote >= 0 ? toText(r[c.quote]) : null,
        billing_milestone: c.milestone >= 0 ? toText(r[c.milestone]) : null,
        billing_status: c.billStatus >= 0 ? toText(r[c.billStatus]) : null,
        invoice_status: c.invStatus >= 0 ? toText(r[c.invStatus]) : null,
        quarter: c.quarter >= 0 ? toText(r[c.quarter]) : null,
        commitment: c.commitment >= 0 ? toText(r[c.commitment]) : null,
        baseline_date: c.baseline >= 0 ? toIsoDate(r[c.baseline]) : null,
        estimate_date: c.estimate >= 0 ? toIsoDate(r[c.estimate]) : null,
        invoice_date: c.invDate >= 0 ? toIsoDate(r[c.invDate]) : null,
        invoice_due_date: c.dueDate >= 0 ? toIsoDate(r[c.dueDate]) : null,
        amount_sgd: c.amount >= 0 ? toAmount(r[c.amount]) : null,
      })
    }
    if (rows.length === 0) throw new Error('No billing rows parsed from the sheet — aborting without changes')

    const sb = createClient()

    // Replace-all import
    const { error: delErr } = await sb.from('billing_milestones').delete().gte('id', 0)
    if (delErr) throw new Error(`Failed clearing table: ${delErr.message}`)
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from('billing_milestones').insert(rows.slice(i, i + 500))
      if (error) throw new Error(`Insert failed at chunk ${i / 500}: ${error.message}`)
    }

    // Refresh billing-derived project values via the master link
    const totals = new Map<string, number>()
    for (const r of rows) totals.set(r.project_name, (totals.get(r.project_name) ?? 0) + (r.amount_sgd ?? 0))
    const { data: projects } = await sb
      .from('projects')
      .select('id, contract_value, master_project(billing_sheet_name)')
      .not('master_project_id', 'is', null)
    let updated = 0
    for (const p of (projects ?? []) as unknown as { id: string; contract_value: number; master_project: { billing_sheet_name: string | null } | null }[]) {
      const sheetName = p.master_project?.billing_sheet_name
      const total = sheetName ? (totals.get(sheetName) ?? 0) : 0
      if (Math.abs((p.contract_value ?? 0) - total) > 0.01) {
        const { error } = await sb.from('projects').update({ contract_value: total }).eq('id', p.id)
        if (!error) updated++
      }
    }

    await sb.from('sync_log').insert({
      source: 'billing-sheet', status: 'success',
      detail: `${rows.length} milestones, ${totals.size} projects, ${updated} project values updated`,
    }).then(() => {}, () => {}) // sync_log schema may differ — non-fatal

    return NextResponse.json({ ok: true, milestones: rows.length, projects: totals.size, valuesUpdated: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
