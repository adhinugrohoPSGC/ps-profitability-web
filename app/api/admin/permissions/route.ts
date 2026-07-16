export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { MENUS, CONFIGURABLE_ROLES, CAPABILITIES } from '@/lib/menus'

// Admin-only: read/update the role → menu permission matrix.

async function requireAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = getServiceClient()
  const { data: caller } = await db.from('user_profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { db }
}

// GET → { matrix: { manager: { dashboard: true, ... }, user: {...}, guest: {...} } }
export async function GET() {
  try {
    const gate = await requireAdmin()
    if ('error' in gate) return gate.error

    const { data } = await gate.db.from('role_permissions').select('role, menu_key, allowed')
    const matrix: Record<string, Record<string, boolean>> = {}
    for (const role of CONFIGURABLE_ROLES) {
      matrix[role] = {}
      for (const m of MENUS) matrix[role][m.key] = false
      for (const c of CAPABILITIES) matrix[role][c] = false
    }
    for (const row of data ?? []) {
      if (matrix[row.role] && row.menu_key in matrix[row.role]) matrix[row.role][row.menu_key] = row.allowed
    }
    return NextResponse.json({ matrix })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load permissions' }, { status: 500 })
  }
}

// PUT { matrix } → upsert every cell
export async function PUT(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if ('error' in gate) return gate.error

    const { matrix } = await req.json() as { matrix: Record<string, Record<string, boolean>> }
    if (!matrix || typeof matrix !== 'object') {
      return NextResponse.json({ error: 'matrix is required' }, { status: 400 })
    }

    const rows: { role: string; menu_key: string; allowed: boolean; updated_at: string }[] = []
    const now = new Date().toISOString()
    const allKeys = [...MENUS.map((m) => m.key), ...CAPABILITIES]
    for (const role of CONFIGURABLE_ROLES) {
      for (const key of allKeys) {
        const allowed = matrix[role]?.[key]
        if (typeof allowed === 'boolean') rows.push({ role, menu_key: key, allowed, updated_at: now })
      }
    }
    if (!rows.length) return NextResponse.json({ error: 'No valid permission cells in payload' }, { status: 400 })

    const { error } = await gate.db.from('role_permissions').upsert(rows)
    if (error) throw error
    return NextResponse.json({ ok: true, updated: rows.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save permissions' }, { status: 500 })
  }
}
