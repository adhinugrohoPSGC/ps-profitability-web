export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getServiceClient } from '@/lib/supabase/service'
import { getCaller } from '@/lib/permissions'
import { AdminUsersClient } from './AdminUsersClient'

export default async function AdminUsersPage() {
  const caller = await getCaller()
  if (!caller) redirect('/login')
  if (!caller.can('users.view')) redirect('/dashboard')

  const db = getServiceClient()
  const { data: users } = await db
    .from('user_profiles')
    .select('id, email, full_name, status, role, created_at, last_seen_at')
    .order('created_at', { ascending: false })

  return (
    <AdminUsersClient
      users={users ?? []}
      callerId={caller.userId}
      isAdmin={caller.isAdmin}
      canEdit={caller.can('users.edit')}
      canDelete={caller.can('users.delete')}
    />
  )
}
