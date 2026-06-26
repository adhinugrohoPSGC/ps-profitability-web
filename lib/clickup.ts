// lib/clickup.ts

export interface ClickUpTimeEntry {
  id: string
  user: { id: number; username: string }
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
): Promise<ClickUpTimeEntry[]> {
  const url =
    `https://api.clickup.com/api/v2/team/${workspaceId}/time_entries` +
    `?list_id=${listId}&start_date=${startMs}&end_date=${endMs}`
  const res = await fetch(url, {
    headers: { Authorization: token },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`ClickUp API ${res.status}: ${await res.text()}`)
  const json = await res.json() as { data: ClickUpTimeEntry[] }
  return json.data ?? []
}
