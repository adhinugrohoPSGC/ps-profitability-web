// lib/clickup.ts

export interface ClickUpTimeEntry {
  id: string
  user: { id: number; username: string; email?: string }
  task: { name: string } | null
  start: string        // Unix ms as string
  duration: string     // ms as string
}

export async function fetchClickUpTimeEntries(
  token: string,
  workspaceId: string,
  listId: string,
  startMs: number,
  endMs: number,
  assigneeIds: string[],
): Promise<ClickUpTimeEntry[]> {
  const assignee = assigneeIds.length ? `&assignee=${assigneeIds.join(',')}` : ''
  const url =
    `https://api.clickup.com/api/v2/team/${workspaceId}/time_entries` +
    `?list_id=${listId}&start_date=${startMs}&end_date=${endMs}${assignee}`
  const res = await fetch(url, {
    headers: { Authorization: token },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`ClickUp API ${res.status}: ${await res.text()}`)
  const json = await res.json() as { data: ClickUpTimeEntry[] }
  return json.data ?? []
}

// Team member ids — the time-entries endpoint only returns the token owner's
// entries unless assignee ids are passed explicitly.
export async function fetchClickUpMemberIds(token: string, workspaceId: string): Promise<string[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${workspaceId}`, {
    headers: { Authorization: token },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`ClickUp API ${res.status}: ${await res.text()}`)
  const json = await res.json() as { team: { members?: { user: { id: number } }[] } }
  return (json.team.members ?? []).map(m => String(m.user.id))
}
