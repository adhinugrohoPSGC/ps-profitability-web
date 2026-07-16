export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { getCaller } from '@/lib/permissions'

// Delete a user (requires the users.delete capability; admins always can).
// You cannot delete yourself or another admin.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!caller.can('users.delete')) return NextResponse.json({ error: 'No permission to delete users' }, { status: 403 })

    const { id } = await params
    if (id === caller.userId) return NextResponse.json({ error: "You can't delete yourself" }, { status: 400 })

    const db = getServiceClient()
    const { data: target } = await db.from('user_profiles').select('role, email').eq('id', id).single()
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (target.role === 'admin') return NextResponse.json({ error: 'Admins cannot be deleted from here' }, { status: 400 })

    const { error } = await db.from('user_profiles').delete().eq('id', id)
    if (error) throw error

    // Remove the auth account too so the email can re-register cleanly.
    // Non-fatal: the profile (and thus all access) is already gone.
    try { await db.auth.admin.deleteUser(id) } catch { /* profile deletion is the hard gate */ }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Delete failed' }, { status: 500 })
  }
}
