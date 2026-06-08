'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { ToastProvider } from '@/components/Toast'
import { ProjectProvider } from '@/contexts/ProjectContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
      else setReady(true)
    })
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    )
  }

  return (
    <ToastProvider>
      <ProjectProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          <Sidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-auto p-6">{children}</main>
          </div>
        </div>
      </ProjectProvider>
    </ToastProvider>
  )
}
