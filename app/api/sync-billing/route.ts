export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { billingNameMatches } from '@/lib/billingMatch'

// Syncs billing_milestones from the PSGC Dashboard's live billing feed.
// The PSGC tracker (psgc-dashboard.vercel.app) already reads the PMO ERP
// Billing Milestone Google Sheet every hour and caches it in the shared
// data_cache table (key = 'billing') — we consume that proven connection
// instead of talking to Google ourselves.

interface CacheBillingRow {
  pm?: string
  month?: string          // quarter, e.g. "Q2:2026"
  remark?: string
  country?: string
  project?: string        // billing sheet project name
  amountSGD?: number
  milestone?: string
  commitment?: string
  invoiceDate?: string
  baselineDate?: string
  contractName?: string
  estimateDate?: string
  billingStatus?: string
  invoiceStatus?: string
  invoiceDueDate?: string
  quotationSource?: string
}

const toText = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}
const toIsoDate = (v: unknown) => {
  const s = String(v ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = createClient()

    const { data: cache, error: cacheErr } = await sb
      .from('data_cache').select('payload, fetched_at').eq('key', 'billing').single()
    if (cacheErr || !cache) {
      throw new Error(`Billing feed not found in data_cache: ${cacheErr?.message ?? 'no row'} — is the PSGC Dashboard sync running?`)
    }
    const feed = (cache.payload as CacheBillingRow[]) ?? []
    if (!Array.isArray(feed) || feed.length === 0) {
      throw new Error('Billing feed is empty — aborting without changes')
    }

    const rows = feed
      .map((r, i) => ({
        source_row: i + 2,
        project_owner: null as string | null, // not present in the live feed
        country: toText(r.country),
        project_manager: toText(r.pm),
        project_name: toText(r.project),
        quotation_source: toText(r.quotationSource),
        billing_milestone: toText(r.milestone),
        billing_status: toText(r.billingStatus),
        invoice_status: toText(r.invoiceStatus),
        quarter: toText(r.month),
        commitment: toText(r.commitment),
        baseline_date: toIsoDate(r.baselineDate),
        estimate_date: toIsoDate(r.estimateDate),
        invoice_date: toIsoDate(r.invoiceDate),
        invoice_due_date: toIsoDate(r.invoiceDueDate),
        amount_sgd: typeof r.amountSGD === 'number' && isFinite(r.amountSGD) ? r.amountSGD : null,
      }))
      .filter(r => r.project_name)

    if (rows.length === 0) throw new Error('No usable billing rows in the feed — aborting without changes')

    // Replace-all import
    const { error: delErr } = await sb.from('billing_milestones').delete().gte('id', 0)
    if (delErr) throw new Error(`Failed clearing table: ${delErr.message}`)
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from('billing_milestones').insert(rows.slice(i, i + 500))
      if (error) throw new Error(`Insert failed at chunk ${i / 500}: ${error.message}`)
    }

    // Refresh billing-derived project values via the master link. Matching
    // falls back to a prefix match to absorb the sheet's 80-char name
    // truncation — see lib/billingMatch.ts.
    const { data: projects } = await sb
      .from('projects')
      .select('id, contract_value, master_project(billing_sheet_name)')
      .not('master_project_id', 'is', null)
    let updated = 0
    const matchedProjectNames = new Set<string>()
    for (const p of (projects ?? []) as unknown as { id: string; contract_value: number; master_project: { billing_sheet_name: string | null } | null }[]) {
      const sheetName = p.master_project?.billing_sheet_name
      let total = 0
      if (sheetName) {
        for (const r of rows) {
          if (r.project_name && billingNameMatches(r.project_name, sheetName)) {
            total += r.amount_sgd ?? 0
            matchedProjectNames.add(r.project_name)
          }
        }
      }
      if (Math.abs((p.contract_value ?? 0) - total) > 0.01) {
        const { error } = await sb.from('projects').update({ contract_value: total }).eq('id', p.id)
        if (!error) updated++
      }
    }

    await sb.from('sync_log').insert({
      source: 'billing-feed', status: 'success',
      detail: `${rows.length} milestones from PSGC feed (fetched ${cache.fetched_at}), ${updated} project values updated`,
    }).then(() => {}, () => {}) // sync_log schema may differ — non-fatal

    return NextResponse.json({
      ok: true, milestones: rows.length, projects: matchedProjectNames.size, valuesUpdated: updated,
      feedFetchedAt: cache.fetched_at,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    // debug: which data URL/schema this lambda resolves (public values)
    const debug = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(unset)',
      schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? '(unset)',
    }
    return NextResponse.json({ error: msg, debug }, { status: 500 })
  }
}
