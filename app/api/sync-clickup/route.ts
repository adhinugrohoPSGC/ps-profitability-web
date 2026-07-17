// app/api/sync-clickup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { fetchClickUpTimeEntries, fetchClickUpMemberIds } from '@/lib/clickup'

const ANON_USER_ID = '00000000-0000-0000-0000-000000000001'
const SYNC_WINDOW_DAYS = 90

interface RateCard { id: number; consultant_name: string | null; email: string | null; cost_rate_sgd: number; bill_rate_sgd: number }

export async function POST(req: NextRequest) {
  // Verify cron secret (only enforced when configured)
  const auth = req.headers.get('authorization') ?? ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createClient()

  // Read ClickUp credentials from settings
  const { data: settingsRows } = await sb
    .from('user_settings')
    .select('key, value')
    .in('key', ['clickup_api_token', 'clickup_workspace_id'])
  const settings = Object.fromEntries(
    (settingsRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  )
  const token = settings['clickup_api_token']
  const workspaceId = settings['clickup_workspace_id']
  if (!token || !workspaceId) {
    return NextResponse.json({ error: 'ClickUp token or workspace ID not configured in Settings' }, { status: 400 })
  }

  // Projects with a ClickUp list id; optionally scoped to one project
  const projectId = req.nextUrl.searchParams.get('projectId')
  let query = sb
    .from('projects')
    .select('id, name, external_id')
    .not('external_id', 'is', null)
    .neq('status', 'archived')
  if (projectId) query = query.eq('id', projectId)
  const { data: projectRows } = await query

  // external_id must look like a ClickUp list id, not a project code like "0221.001"
  const projects = ((projectRows ?? []) as { id: string; name: string; external_id: string }[])
    .filter(p => /^\d{6,}$/.test(p.external_id))

  if (!projects.length) {
    return NextResponse.json(
      projectId
        ? { synced: 0, projects: [], error: 'This project has no ClickUp list linked (external ID)' }
        : { synced: 0, projects: [] },
      { status: projectId ? 400 : 200 },
    )
  }

  // Rate lookup: entry email -> rate_card.email, else username -> consultant_name / alias
  const { data: rateCards } = await sb
    .from('rate_card')
    .select('id, consultant_name, email, cost_rate_sgd, bill_rate_sgd')
    .eq('active', true)
  const { data: aliases } = await sb.from('name_aliases').select('alias, rate_card_id')
  const rcById = new Map((rateCards ?? []).map((r: RateCard) => [r.id, r]))
  const byEmail = new Map((rateCards ?? []).filter((r: RateCard) => r.email).map((r: RateCard) => [r.email!.toLowerCase(), r]))
  const byName = new Map((rateCards ?? []).filter((r: RateCard) => r.consultant_name).map((r: RateCard) => [r.consultant_name!.trim().toLowerCase(), r]))
  for (const a of (aliases ?? []) as { alias: string | null; rate_card_id: number }[]) {
    const rc = rcById.get(a.rate_card_id)
    if (rc && a.alias) byName.set(a.alias.trim().toLowerCase(), rc)
  }
  const lookupRc = (email: string | undefined, username: string) =>
    byEmail.get((email ?? '').toLowerCase()) ?? byName.get(username.trim().toLowerCase())

  const memberIds = await fetchClickUpMemberIds(token, workspaceId)

  const now = Date.now()
  const windowStartMs = now - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const windowStartDate = new Date(windowStartMs).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const syncedProjects: string[] = []
  let totalRows = 0

  for (const project of projects) {
    try {
      const entries = (await fetchClickUpTimeEntries(token, workspaceId, project.external_id, windowStartMs, now, memberIds))
        .filter(e => Number(e.duration) > 0)

      // Incremental refresh: replace only ClickUp rows inside the sync window,
      // leaving older (backfilled) history untouched.
      await sb
        .from('timesheet_entries')
        .delete()
        .eq('project_id', project.id)
        .like('import_batch_id', 'clickup-%')
        .gte('entry_date', windowStartDate)

      if (!entries.length) { syncedProjects.push(project.name); continue }

      const batchId = `clickup-${project.id}-${today}`
      const mapped = entries.map(e => {
        const rc = lookupRc(e.user.email, e.user.username)
        const hours = Math.round((Number(e.duration) / 3600000) * 100) / 100
        return {
          project_id: project.id,
          entry_date: new Date(Number(e.start)).toISOString().slice(0, 10),
          consultant_name: e.user.username,
          user_external_id: String(e.user.id),
          task_description: e.task?.name ?? '',
          phase: '',
          hours,
          rate_card_id: rc?.id ?? null,
          cost_rate_sgd: rc?.cost_rate_sgd ?? 0,
          labour_cost_sgd: Math.round(hours * (rc?.cost_rate_sgd ?? 0) * 100) / 100,
          bill_rate_sgd: rc?.bill_rate_sgd ?? 0,
          billable_value_sgd: Math.round(hours * (rc?.bill_rate_sgd ?? 0) * 100) / 100,
          import_batch_id: batchId,
        }
      })

      for (let i = 0; i < mapped.length; i += 500) {
        const { error } = await sb.from('timesheet_entries').insert(mapped.slice(i, i + 500))
        if (error) throw error
      }

      await sb.from('import_log').insert({
        batch_id: batchId,
        project_id: project.id,
        template_type: 'clickup-sync',
        filename: `clickup-sync-${today}`,
        rows_imported: mapped.length,
        rows_skipped: 0,
        user_id: ANON_USER_ID,
      })

      totalRows += mapped.length
      syncedProjects.push(project.name)
    } catch (err) {
      console.error(`ClickUp sync failed for project ${project.name}:`, err)
      // Continue to next project — partial success is acceptable
    }
  }

  return NextResponse.json({ synced: syncedProjects.length, rows: totalRows, windowDays: SYNC_WINDOW_DAYS, projects: syncedProjects })
}
