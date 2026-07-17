import { createClient } from '@/lib/supabase/client'

// Supabase caps each request at 1000 rows; page through to get complete data.
export async function fetchAllRows<T>(table: string, projectId: string, orderCol: string): Promise<T[]> {
  const sb = createClient()
  const out: T[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .order(orderCol, { ascending: false })
      .order('id', { ascending: false })
      .range(off, off + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}
