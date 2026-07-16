'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Upload, FolderKanban, Users,
  FileBarChart2, Settings, TrendingUp, ClipboardList, ShieldCheck,
} from 'lucide-react'

const NAV = [
  { key: 'dashboard', href: '/dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
  { key: 'upload',    href: '/upload',     label: 'Upload Templates',  icon: Upload },
  { key: 'records',   href: '/records',    label: 'Records',           icon: ClipboardList },
  { key: 'projects',  href: '/projects',   label: 'Projects',          icon: FolderKanban },
  { key: 'rate-card', href: '/rate-card',  label: 'Rate Card',         icon: Users },
  { key: 'reports',   href: '/reports',    label: 'Reports',           icon: FileBarChart2 },
  { key: 'settings',  href: '/settings',   label: 'Settings',          icon: Settings },
]

export default function Sidebar({ allowedMenus, showUsers = false }: {
  allowedMenus?: string[] // undefined = all menus (admin)
  showUsers?: boolean
}) {
  const pathname = usePathname()
  const nav = allowedMenus ? NAV.filter(item => allowedMenus.includes(item.key)) : NAV

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
        {nav.map(({ href, label, icon: Icon }) => {
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
        {showUsers && (
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
