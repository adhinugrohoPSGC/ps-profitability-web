'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import { LogOut, ChevronDown } from 'lucide-react'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/upload':    'Upload Templates',
  '/projects':  'Projects',
  '/rate-card': 'Rate Card Manager',
  '/reports':   'Reports',
  '/settings':  'Settings',
}

export default function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { selectedProject, setSelectedProject } = useProject()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserEmail(user.email ?? '')
    })
    supabase.from('projects').select('id, name').order('created_at', { ascending: false })
      .then(({ data }) => setProjects(data ?? []))
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const showProjectSelector = ['/dashboard', '/upload', '/reports'].includes(pathname)

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-slate-200 flex-shrink-0">
      <h1 className="text-sm font-semibold text-slate-800">{TITLES[pathname] ?? ''}</h1>
      <div className="flex items-center gap-3">
        {showProjectSelector && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Project:</span>
            <div className="relative">
              <select
                value={selectedProject ?? ''}
                onChange={e => setSelectedProject(e.target.value || null)}
                className="appearance-none bg-slate-50 border border-slate-200 rounded-lg text-sm pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700"
              >
                <option value="">— Select project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        )}
        <span className="text-xs text-slate-400 hidden md:block">{userEmail}</span>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
