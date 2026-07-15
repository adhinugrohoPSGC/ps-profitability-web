import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminUsersClient from './AdminUsersClient'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: users } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-6">User Management</h2>
      <AdminUsersClient users={users ?? []} />
    </div>
  )
}
