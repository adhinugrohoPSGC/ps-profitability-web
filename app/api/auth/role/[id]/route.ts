export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/menus'

// Admin-only: change a user's role. You cannot change your own role (lockout guard).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = getServiceClient()
    const { data: caller } = await db.from('user_profiles').select('role').eq('id', user.id).single()
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (id === user.id) {
      return NextResponse.json({ error: "You can't change your own role" }, { status: 400 })
    }

    const { role } = await req.json()
    if (!ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role — must be one of: ${ROLES.join(', ')}` }, { status: 400 })
    }

    const { error } = await db.from('user_profiles').update({ role }).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Role update failed' }, { status: 500 })
  }
}
