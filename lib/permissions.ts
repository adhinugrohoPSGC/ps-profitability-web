import { getServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

export type Caller = {
  userId: string
  email: string | null
  role: string
  isAdmin: boolean
  /** Menu keys AND capability keys this role is allowed (admin: everything). */
  allowed: Set<string>
  can: (key: string) => boolean
}

// Resolve the logged-in caller and their full permission set (menus + capabilities).
// Admin implicitly passes every check.
export async function getCaller(): Promise<Caller | null> {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null

  const db = getServiceClient()
  const { data: profile } = await db.from('user_profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? 'user'
  const isAdmin = role === 'admin'

  let allowed = new Set<string>()
  if (!isAdmin) {
    const { data } = await db.from('role_permissions').select('menu_key, allowed').eq('role', role)
    allowed = new Set((data ?? []).filter((p) => p.allowed).map((p) => p.menu_key))
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    isAdmin,
    allowed,
    can: (key: string) => isAdmin || allowed.has(key),
  }
}
