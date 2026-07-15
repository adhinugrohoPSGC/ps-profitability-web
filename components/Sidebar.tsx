'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Upload, FolderKanban, Users,
  FileBarChart2, Settings, TrendingUp, ClipboardList, ShieldCheck,
} from 'lucide-react'

const NAV = [
  { href: '/dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/upload',     label: 'Upload Templates',  icon: Upload },
  { href: '/records',    label: 'Records',           icon: ClipboardList },
  { href: '/projects',   label: 'Projects',          icon: FolderKanban },
  { href: '/rate-card',  label: 'Rate Card',         icon: Users },
  { href: '/reports',    label: 'Reports',           icon: FileBarChart2 },
  { href: '/settings',   label: 'Settings',          icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await sb
        .from('user_profiles').select('role').eq('id', data.user.id).single()
      setIsAdmin(profile?.role === 'admin')
    })
  }, [])

  return (
    <aside className="w-60 flex-shrink-0 bg-sidebar flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <TrendingUp className="text-white" size={18} />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">PS Global</p>
            <p className="text-white/50 text-xs">Profitability</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-accent text-white' : 'text-white/60 hover:bg-sidebar-hover hover:text-white'
              }`}
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
            </Link>
          )
        })}
        {isAdmin && (
          <Link href="/admin/users"
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/admin/users'
                ? 'bg-accent text-white'
                : 'text-white/60 hover:bg-sidebar-hover hover:text-white'
            }`}
          >
            <ShieldCheck size={16} />
            <span className="flex-1">Admin: Users</span>
          </Link>
        )}
      </nav>
      <div className="px-5 py-3 border-t border-white/10">
        <p className="text-white/30 text-xs">v2.0.0 · Web</p>
      </div>
    </aside>
  )
}
