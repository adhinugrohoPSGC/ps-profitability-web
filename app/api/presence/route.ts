export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'

// POST — heartbeat: stamp the current user's last_seen_at
export async function POST() {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const db = getServiceClient()
    await db.from('user_profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

// GET — admin only: current last_seen_at for every user (for the live "active now" view)
export async function GET() {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const db = getServiceClient()
    const { data: caller } = await db.from('user_profiles').select('role').eq('id', user.id).single()
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const { data } = await db
      .from('user_profiles')
      .select('id, last_seen_at')
    return NextResponse.json({ presence: data ?? [], now: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
