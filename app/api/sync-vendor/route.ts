export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

// Syncs vendor_costs from the 3rd Party Vendor Google Sheet (nightly cron +
// "Sync Vendors" button on Records). Reads the sheet's public CSV export.
// The sheet has an exchange-rate block on top and a three-tier header; we
// locate the header row by its "Project Name" cell and take the
// Implementation Charges section columns (first occurrence of PSGC Portion /
// 3rd Party Portion / 3rd Party Value (SGD)). amount_sgd = 3rd Party Value
// (SGD), which is what the dashboard counts as vendor cost. Each run
// replaces only sheet-synced rows (batch 'gsheet-…'); manually added vendor
// costs are untouched.

const SHEET_ID = '1E-fKah3XpJLuxALR-OQLS60Q0axSDp2rAvlxZwh3rdk'
const ANON_USER_ID = '00000000-0000-0000-0000-000000000001'

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s_\-()/\n]/g, '')
const toAmount = (v: unknown): number => {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}
const codeOf = (s: string | null | undefined) => s?.match(/\d{4}\.\d{3}/)?.[0] ?? null

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`, { redirect: 'follow', cache: 'no-store' })
    const text = await res.text()
    if (!res.ok || text.trimStart().startsWith('<')) {
      throw new Error('Could not read the vendor Google Sheet — share it as "Anyone with the link – Viewer" and try again')
    }

    const wb = XLSX.read(text, { type: 'string' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    const headerIdx = grid.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === 'projectname'))
    if (headerIdx === -1) throw new Error('Could not find the "Project Name" header row in the vendor sheet')
    const main = grid[headerIdx].map(norm)
    const sub = (grid[headerIdx + 1] ?? []).map(norm)
    const first = (row: string[], key: string) => row.indexOf(key)
    const cols = {
      project: first(main, 'projectname'),
      product: first(main, 'productname'),
      year: first(main, 'yearofsignoff'),
      value_sgd: first(sub, 'valuesgd'),            // Implementation Fees → Value (SGD)
      psgc: first(main, 'psgcportion'),             // first occurrence = implementation section
      tp: first(main, '3rdpartyportion'),
      tp_value: first(main, '3rdpartyvaluesgd'),
      remarks: first(main, 'remarks'),
    }
    const missing = Object.entries(cols).filter(([, v]) => v === -1).map(([k]) => k)
    if (missing.length) throw new Error(`Vendor sheet columns not found: ${missing.join(', ')}`)

    const sb = createClient()

    // `service` is maintained in the app (Records → 3rd Party Vendor), not in
    // the sheet, so remember it before the replace and re-apply it below.
    // Keyed on project + product, which is the contract's stable identity.
    const { data: existing, error: existErr } = await sb
      .from('vendor_costs').select('project_id, vendor_name, service').not('service', 'is', null)
    if (existErr) throw new Error(`Could not read existing services: ${existErr.message}`)
    const serviceByKey = new Map(
      ((existing ?? []) as { project_id: string; vendor_name: string; service: string }[])
        .map(r => [`${r.project_id}|${r.vendor_name}`, r.service])
    )

    const { data: projData, error: projErr } = await sb.from('projects').select('id, name')
    if (projErr) throw new Error(`Projects read failed: ${projErr.message}`)
    const projects = (projData ?? []) as { id: string; name: string }[]
    const byName = new Map(projects.map(p => [p.name, p.id]))
    const byCode = new Map<string, string | null>()
    for (const p of projects) {
      const code = codeOf(p.name)
      if (!code) continue
      byCode.set(code, byCode.has(code) ? null : p.id) // null = ambiguous
    }

    const today = new Date().toISOString().slice(0, 10)
    const batch = `gsheet-${today}`
    const unmatched = new Map<string, number>()
    const entries: Record<string, unknown>[] = []
    let sheetRows = 0
    for (let i = headerIdx + 2; i < grid.length; i++) {
      const r = grid[i]
      if (!Array.isArray(r)) continue
      const projectName = String(r[cols.project] ?? '').trim()
      if (!projectName) continue
      sheetRows++
      const projectId = byName.get(projectName) ?? (codeOf(projectName) ? byCode.get(codeOf(projectName)!) || null : null)
      if (!projectId) {
        unmatched.set(projectName, (unmatched.get(projectName) ?? 0) + 1)
        continue
      }
      const year = parseInt(String(r[cols.year] ?? ''), 10)
      const product = String(r[cols.product] ?? '').trim() || '(unnamed product)'
      entries.push({
        user_id: ANON_USER_ID,
        project_id: projectId,
        vendor_name: product,
        description: String(r[cols.remarks] ?? '').trim() || null,
        cost_date: year >= 2000 && year <= 2100 ? `${year}-01-01` : today,
        value_sgd: toAmount(r[cols.value_sgd]),
        psgc_portion: toAmount(r[cols.psgc]),
        third_party_portion: toAmount(r[cols.tp]),
        amount_sgd: toAmount(r[cols.tp_value]),
        service: serviceByKey.get(`${projectId}|${product}`) ?? null,
        import_batch_id: batch,
      })
    }
    if (entries.length === 0) {
      throw new Error(`Vendor sheet parsed (${sheetRows} rows) but none matched a project — sample project values: ${[...unmatched.keys()].slice(0, 5).join(' | ')}`)
    }

    const { error: delErr } = await sb.from('vendor_costs').delete().like('import_batch_id', 'gsheet-%')
    if (delErr) throw new Error(`Failed clearing previous sheet sync: ${delErr.message}`)
    const { error: insErr } = await sb.from('vendor_costs').insert(entries)
    if (insErr) throw new Error(`Insert failed: ${insErr.message}`)

    return NextResponse.json({
      ok: true,
      imported: entries.length,
      sheetRows,
      skippedNoProject: sheetRows - entries.length,
      servicesPreserved: entries.filter(e => e.service).length,
      servicesOrphaned: serviceByKey.size - entries.filter(e => e.service).length,
      unmatchedProjects: [...unmatched.entries()].map(([name, count]) => ({ name, count })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
