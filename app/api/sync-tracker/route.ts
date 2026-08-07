export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

// Auto-fetches project details (PM, status, kick-off, go-live) from the PSGC
// Project Tracker's psgc_legacy_projects table (same shared DB), so they are
// maintained in ONE place. Matched via master_project.legacy_project_id when
// linked, otherwise by exact project name. Tracker fields that are empty
// never blank out existing values here.

interface TrackerRow {
  id: string
  project_name: string
  pm: string | null
  status: string | null
  kick_off_date: string | null
  go_live_date: string | null
}

// Tracker statuses are health flags; map the lifecycle-relevant ones only.
function mapStatus(trackerStatus: string | null, current: string): string | null {
  const s = (trackerStatus ?? '').toLowerCase()
  if (!s) return null
  if (s === 'closed') return 'completed'
  if (s === 'on hold') return 'on-hold'
  // any other flag (Normal, Urgent, Chase, …) means the project is being worked
  return current === 'archived' ? null : 'active'
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = createClient()

    const [{ data: trackerData, error: trackerErr }, { data: projData, error: projErr }] = await Promise.all([
      sb.from('psgc_legacy_projects').select('id, project_name, pm, status, kick_off_date, go_live_date'),
      sb.from('projects').select('id, name, project_manager, status, start_date, end_date, master_project(legacy_project_id)'),
    ])
    if (trackerErr) throw new Error(`Tracker read failed: ${trackerErr.message}`)
    if (projErr) throw new Error(`Projects read failed: ${projErr.message}`)

    const tracker = (trackerData ?? []) as TrackerRow[]
    if (tracker.length === 0) throw new Error('PSGC Project Tracker has no rows — aborting without changes')
    const byId = new Map(tracker.map(t => [t.id, t]))
    const byName = new Map(tracker.map(t => [t.project_name, t]))

    const projects = (projData ?? []) as unknown as {
      id: string; name: string; project_manager: string | null; status: string
      start_date: string | null; end_date: string | null
      master_project: { legacy_project_id: string | null } | null
    }[]

    let matched = 0, updated = 0
    for (const p of projects) {
      const t = (p.master_project?.legacy_project_id ? byId.get(p.master_project.legacy_project_id) : undefined)
        ?? byName.get(p.name)
      if (!t) continue
      matched++

      const patch: Record<string, string> = {}
      if (t.pm && t.pm !== p.project_manager) patch.project_manager = t.pm
      if (t.kick_off_date && t.kick_off_date !== p.start_date) patch.start_date = t.kick_off_date
      if (t.go_live_date && t.go_live_date !== p.end_date) patch.end_date = t.go_live_date
      const status = mapStatus(t.status, p.status)
      if (status && status !== p.status) patch.status = status

      if (Object.keys(patch).length === 0) continue
      const { error } = await sb.from('projects').update(patch).eq('id', p.id)
      if (!error) updated++
    }

    return NextResponse.json({ ok: true, trackerProjects: tracker.length, matched, updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
