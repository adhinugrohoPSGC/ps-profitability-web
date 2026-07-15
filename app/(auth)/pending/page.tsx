'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, Clock } from 'lucide-react'

export default function PendingPage() {
  const router = useRouter()

  async function handleLogout() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
            <TrendingUp className="text-white" size={22} />
          </div>
          <div className="text-left">
            <p className="font-bold text-slate-800 leading-tight">PS Global</p>
            <p className="text-xs text-slate-500">Profitability Dashboard</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <Clock className="text-amber-500" size={28} />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Account Pending Approval</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your account is awaiting admin approval. You will be able to access the dashboard once approved.
          </p>
          <button
            onClick={handleLogout}
            className="w-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">PS Global Consulting · Internal Tool</p>
      </div>
    </div>
  )
}
