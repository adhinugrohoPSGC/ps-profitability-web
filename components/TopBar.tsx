'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'
import { ChevronDown, LogOut } from 'lucide-react'

const TITLES: Record<string, string> = {
  '/dashboard':   'Dashboard',
  '/upload':      'Upload Templates',
  '/projects':    'Projects',
  '/rate-card':   'Rate Card Manager',
  '/reports':     'Reports',
  '/records':     'Records',
  '/settings':    'Settings',
}

export default function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { selectedProject, setSelectedProject } = useProject()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [userName, setUserName] = useState('')

  useEffect(() => {
    const sb = createClient()
    sb.from('projects').select('id, name').order('created_at', { ascending: false })
      .then(({ data }) => setProjects(data ?? []))
    sb.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserName(
          data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || ''
        )
      }
    })
  }, [])

  async function handleLogout() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const showProjectSelector = ['/dashboard', '/upload', '/reports', '/records'].includes(pathname)

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
        {userName && (
          <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
            <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-teal-700">{userName[0].toUpperCase()}</span>
            </div>
            <span className="text-xs text-slate-600 max-w-[120px] truncate">{userName}</span>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-slate-400 hover:text-red-500 transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
