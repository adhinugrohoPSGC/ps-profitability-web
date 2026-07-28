import { createClient } from '@/lib/supabase/client'

// PostgREST caps each request (see docs/db-max-rows.md for the raised
// server-side limit); page through in large chunks so today's datasets
// finish in a single request while still handling future growth safely.
const PAGE_SIZE = 5000

export async function fetchAllRows<T>(table: string, projectId: string, orderCol: string): Promise<T[]> {
  const sb = createClient()
  const out: T[] = []
  for (let off = 0; ; off += PAGE_SIZE) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .order(orderCol, { ascending: false })
      .order('id', { ascending: false })
      .range(off, off + PAGE_SIZE - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return out
}
