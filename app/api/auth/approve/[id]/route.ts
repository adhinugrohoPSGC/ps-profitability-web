export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { getCaller } from '@/lib/permissions'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Requires the users.edit capability (admins always pass)
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!caller.can('users.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const db = getServiceClient()

    const { action } = await req.json() // 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { id } = await params
    const { error } = await db
      .from('user_profiles')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ message: `User ${action}d successfully` })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Action failed' }, { status: 500 })
  }
}
