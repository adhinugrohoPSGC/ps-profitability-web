'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createAuthClient } from '@/lib/supabase/auth-client'
import { useProject } from '@/contexts/ProjectContext'
import { ChevronDown, LogOut, Search, Check } from 'lucide-react'

const TITLES: Record<string, string> = {
  '/dashboard':   'Dashboard',
  '/upload':      'Upload Templates',
  '/projects':    'Projects',
  '/rate-card':   'Rate Card Manager',
  '/reports':     'Reports',
  '/records':     'Records',
  '/billing':     'Billing Milestones',
  '/settings':    'Settings',
  '/admin/users': 'User Management',
}

export default function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { selectedProject, setSelectedProject } = useProject()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [userName, setUserName] = useState('')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient().from('projects').select('id, name').order('name')
      .then(({ data }) => setProjects(data ?? []))
    createAuthClient().auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserName(
          data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || ''
        )
      }
    })
  }, [])

  async function handleLogout() {
    await createAuthClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const showProjectSelector = ['/dashboard', '/upload', '/reports', '/records'].includes(pathname)
  const selectedName = projects.find(p => p.id === selectedProject)?.name
  const q = query.trim().toLowerCase()
  const shown = q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects

  function pick(id: string | null) {
    setSelectedProject(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-slate-200 flex-shrink-0">
      <h1 className="text-sm font-semibold text-slate-800">{TITLES[pathname] ?? ''}</h1>
      <div className="flex items-center gap-3">
        {showProjectSelector && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Project:</span>
            <div ref={ref} className="relative">
              <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-haspopup="listbox"
                className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg text-sm pl-3 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 max-w-[380px]"
              >
                <span className="truncate">{selectedName ?? '— Select project —'}</span>
                <ChevronDown size={13} className={`flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="absolute right-0 z-40 mt-1 w-[420px] bg-white border border-slate-200 rounded-lg shadow-lg">
                  <div className="relative px-3 py-2 border-b border-slate-100">
                    <Search size={12} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      autoFocus
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search projects…"
                      className="w-full text-xs border border-slate-200 rounded-md pl-6 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
                    <li>
                      <button
                        type="button"
                        onClick={() => pick(null)}
                        className="w-full px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
                      >
                        — Select project —
                      </button>
                    </li>
                    {shown.length === 0 ? (
                      <li className="px-3 py-3 text-xs text-slate-400 text-center">No matching projects</li>
                    ) : shown.map(p => {
                      const isSel = p.id === selectedProject
                      return (
                        <li key={p.id} role="option" aria-selected={isSel}>
                          <button
                            type="button"
                            onClick={() => pick(p.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                          >
                            <span className="w-3.5 flex-shrink-0">
                              {isSel && <Check size={12} className="text-teal-600" />}
                            </span>
                            <span className={`flex-1 truncate ${isSel ? 'text-teal-700 font-medium' : 'text-slate-600'}`} title={p.name}>
                              {p.name}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
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
