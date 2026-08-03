export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCaller } from '@/lib/permissions'
import { MasterDataClient } from './MasterDataClient'

export default async function AdminMasterPage() {
  const caller = await getCaller()
  if (!caller) redirect('/login')
  if (!caller.isAdmin) redirect('/dashboard')

  return <MasterDataClient />
}
