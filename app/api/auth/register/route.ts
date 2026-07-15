import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest) {
  const { email, password, full_name } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const { error: profileError } = await service.from('user_profiles').insert({
    id: authData.user.id,
    email,
    full_name: full_name || null,
    status: 'pending',
    role: 'user',
  })

  if (profileError) {
    await service.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
