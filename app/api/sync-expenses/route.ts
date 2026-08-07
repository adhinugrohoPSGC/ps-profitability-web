export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { parseExpensesXLS } from '@/lib/parseTemplates'

// Syncs expense_entries from the company expenses Google Sheet (nightly cron
// + manual button on Records). The sheet must be shared as "Anyone with the
// link – Viewer" — we read its CSV export, no Google credentials involved.
// Rows are matched to projects by exact name, then by the 0000.000 code
// prefix. Each run replaces only previous sheet-synced rows (batch id
// 'gsheet-…'), leaving manual Excel imports untouched.

const SHEET_ID = '1IZm4xQ4dB-lnQ3ROY839M08YwFjsXvVj3ajqlnFbi7Q'
const SHEET_GID = '1100824269'
const ANON_USER_ID = '00000000-0000-0000-0000-000000000001'
const CHUNK = 500

const codeOf = (s: string | null | undefined) => s?.match(/\d{4}\.\d{3}/)?.[0] ?? null

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`
    const res = await fetch(csvUrl, { redirect: 'follow', cache: 'no-store' })
    let text = await res.text()
    if (!res.ok || text.trimStart().startsWith('<')) {
      throw new Error('Could not read the expenses Google Sheet — share it as "Anyone with the link – Viewer" (File → Share) and try again')
    }
    // The sheet has decorative blank rows above the header — drop leading
    // lines with no content so the parser sees the header row first. (Safe:
    // quoted embedded newlines only appear from the header row onwards.)
    const lines = text.split(/\r?\n/)
    while (lines.length && lines[0].replace(/[",\s]/g, '') === '') lines.shift()
    text = lines.join('\n')

    const sb = createClient()
    const { data: settings } = await sb.from('user_settings').select('key, value').eq('key', 'usd_to_idr')
    const fxRate = Number((settings?.[0] as { value?: string } | undefined)?.value) || 15000

    const bytes = new TextEncoder().encode(text)
    const { rows, warnings } = parseExpensesXLS(bytes.buffer as ArrayBuffer, undefined, fxRate)
    if (rows.length === 0) throw new Error(`No usable expense rows found in the sheet${warnings[0] ? ` (${warnings[0]})` : ''}`)

    // Project matching: exact name first, then unique 0000.000 code prefix
    const { data: projData, error: projErr } = await sb.from('projects').select('id, name')
    if (projErr) throw new Error(`Projects read failed: ${projErr.message}`)
    const projects = (projData ?? []) as { id: string; name: string }[]
    const byName = new Map(projects.map(p => [p.name, p.id]))
    const byCode = new Map<string, string | null>()
    for (const p of projects) {
      const code = codeOf(p.name)
      if (!code) continue
      byCode.set(code, byCode.has(code) ? null : p.id) // null = ambiguous code
    }

    const unmatched = new Map<string, number>()
    const entries: Record<string, unknown>[] = []
    const today = new Date().toISOString().slice(0, 10)
    const batch = `gsheet-${today}`
    for (const row of rows) {
      const rawProject = row.project_id
      const projectId = byName.get(rawProject) ?? (codeOf(rawProject) ? byCode.get(codeOf(rawProject)!) || null : null)
      if (!projectId) {
        unmatched.set(rawProject || '(blank)', (unmatched.get(rawProject || '(blank)') ?? 0) + 1)
        continue
      }
      // Prefer the sheet's own "Amount in SGD" column; fall back to the same
      // conversion the manual Excel importer uses when it's blank.
      const amountSgd = row.amount_sgd_reported > 0 ? row.amount_sgd_reported
        : row.currency === 'SGD' ? row.amount_native
        : row.currency === 'IDR' ? row.amount_native / fxRate
        : row.amount_native
      entries.push({
        user_id: ANON_USER_ID,
        project_id: projectId,
        expense_date: row.expense_date || null,
        identifier: row.identifier || null,
        company_name: row.company_name || null,
        country: row.country || null,
        project_code_name: rawProject || null,
        prs_prj: row.prs_prj || null,
        sales_person: row.sales_person || null,
        pm: row.pm || null,
        resource: row.resource || null,
        category: row.category,
        month: row.month || null,
        billable_to_client: row.billable_to_client,
        amount_native: row.amount_native,
        currency: row.currency,
        amount_sgd: amountSgd,
        import_batch_id: batch,
      })
    }
    if (entries.length === 0) {
      throw new Error(`Sheet parsed (${rows.length} rows) but none matched a project — sample project values: ${[...unmatched.keys()].slice(0, 5).join(' | ')}`)
    }

    // Replace previous sheet-synced rows only; manual imports keep living
    const { error: delErr } = await sb.from('expense_entries').delete().like('import_batch_id', 'gsheet-%')
    if (delErr) throw new Error(`Failed clearing previous sheet sync: ${delErr.message}`)
    for (let i = 0; i < entries.length; i += CHUNK) {
      const { error } = await sb.from('expense_entries').insert(entries.slice(i, i + CHUNK))
      if (error) throw new Error(`Insert failed at chunk ${i / CHUNK}: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      imported: entries.length,
      sheetRows: rows.length,
      skippedNoProject: rows.length - entries.length,
      unmatchedProjects: [...unmatched.entries()].map(([name, count]) => ({ name, count })).slice(0, 25),
      parserWarnings: warnings.slice(0, 10),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
