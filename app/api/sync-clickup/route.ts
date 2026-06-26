// app/api/sync-clickup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { fetchClickUpTimeEntries } from '@/lib/clickup'

const ANON_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  // Verify cron secret
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

  // Fetch active projects with a ClickUp list ID
  const { data: projects } = await sb
    .from('projects')
    .select('id, name, external_id')
    .not('external_id', 'is', null)
    .neq('status', 'archived')

  if (!projects?.length) {
    return NextResponse.json({ synced: 0, projects: [] })
  }

  // Load rate card for cost lookup
  const { data: rateCards } = await sb
    .from('rate_card')
    .select('id, user_external_id, cost_rate_sgd, bill_rate_sgd')
    .eq('active', true)

  const rcMap: Record<string, { id: number; cost: number; bill: number }> = {}
  for (const rc of (rateCards ?? []) as { id: number; user_external_id: string | null; cost_rate_sgd: number; bill_rate_sgd: number }[]) {
    if (rc.user_external_id) rcMap[rc.user_external_id] = { id: rc.id, cost: rc.cost_rate_sgd, bill: rc.bill_rate_sgd }
  }

  const now = Date.now()
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000
  const today = new Date().toISOString().slice(0, 10)
  const syncedProjects: string[] = []

  for (const project of projects as { id: string; name: string; external_id: string }[]) {
    try {
      const entries = await fetchClickUpTimeEntries(token, workspaceId, project.external_id, ninetyDaysAgo, now)

      // Full refresh: delete previous clickup-synced rows for this project
      await sb
        .from('timesheet_entries')
        .delete()
        .eq('project_id', project.id)
        .like('import_batch_id', 'clickup-%')

      if (!entries.length) continue

      const batchId = `clickup-${project.id}-${today}`
      const mapped = entries.map(e => {
        const userIdStr = String(e.user.id)
        const rc = rcMap[userIdStr]
        const hours = Math.round((Number(e.duration) / 3600000) * 100) / 100
        return {
          project_id: project.id,
          entry_date: new Date(Number(e.start)).toISOString().slice(0, 10),
          consultant_name: e.user.username,
          user_external_id: userIdStr,
          external_project_id: project.external_id,
          task_description: e.task?.name ?? '',
          phase: '',
          hours,
          rate_card_id: rc?.id ?? null,
          cost_rate_sgd: rc?.cost ?? 0,
          labour_cost_sgd: hours * (rc?.cost ?? 0),
          bill_rate_sgd: rc?.bill ?? 0,
          billable_value_sgd: hours * (rc?.bill ?? 0),
          import_batch_id: batchId,
        }
      })

      const { error } = await sb.from('timesheet_entries').insert(mapped)
      if (error) throw error

      await sb.from('import_log').insert({
        batch_id: batchId,
        project_id: project.id,
        template_type: 'clickup-sync',
        filename: `clickup-sync-${today}`,
        rows_imported: mapped.length,
        rows_skipped: 0,
        user_id: ANON_USER_ID,
      })

      syncedProjects.push(project.name)
    } catch (err) {
      console.error(`ClickUp sync failed for project ${project.name}:`, err)
      // Continue to next project — partial success is acceptable
    }
  }

  return NextResponse.json({ synced: syncedProjects.length, projects: syncedProjects })
}
