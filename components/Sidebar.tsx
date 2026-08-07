'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Upload, FolderKanban, Users,
  FileBarChart2, Settings, TrendingUp, ClipboardList, ShieldCheck, ReceiptText, Database,
  PieChart, Building2, HardHat,
} from 'lucide-react'

type NavItem = { key: string; href: string; label: string; icon: typeof PieChart; adminOnly?: 'master' | 'users' }

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Summary',
    items: [
      { key: 'summary', href: '/summary', label: 'Dashboard', icon: PieChart },
      { key: 'billing', href: '/billing', label: 'Billing', icon: ReceiptText },
      { key: 'vendor-summary', href: '/vendor-summary', label: '3rd Party Vendor', icon: Building2 },
      { key: 'manpower-summary', href: '/manpower-summary', label: 'Man Power Cost', icon: HardHat },
    ],
  },
  {
    title: 'Project',
    items: [
      { key: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'projects', href: '/projects', label: 'Projects', icon: FolderKanban },
      { key: 'records', href: '/records', label: 'Records', icon: ClipboardList },
      { key: 'upload', href: '/upload', label: 'Upload Templates', icon: Upload },
      { key: 'reports', href: '/reports', label: 'Reports', icon: FileBarChart2 },
    ],
  },
  {
    title: 'Setting',
    items: [
      { key: 'settings', href: '/settings', label: 'Preferences', icon: Settings },
      { key: 'rate-card', href: '/rate-card', label: 'Rate Card', icon: Users },
      { key: 'admin-master', href: '/admin/master', label: 'Master Data', icon: Database, adminOnly: 'master' },
      { key: 'admin-users', href: '/admin/users', label: 'Users', icon: ShieldCheck, adminOnly: 'users' },
    ],
  },
]

export default function Sidebar({ allowedMenus, showUsers = false, showMaster = false }: {
  allowedMenus?: string[] // undefined = all menus (admin)
  showUsers?: boolean
  showMaster?: boolean
}) {
  const pathname = usePathname()

  const visible = (item: NavItem) => {
    if (item.adminOnly === 'master') return showMaster
    if (item.adminOnly === 'users') return showUsers
    return !allowedMenus || allowedMenus.includes(item.key)
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-200/80 flex flex-col overflow-y-auto">
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center shadow-sm">
            <TrendingUp className="text-white" size={18} />
          </div>
          <div>
            <p className="text-slate-800 font-semibold text-sm leading-tight">PS Global</p>
            <p className="text-slate-400 text-xs">Profitability</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 pb-3">
        {GROUPS.map(group => {
          const items = group.items.filter(visible)
          if (items.length === 0) return null
          return (
            <div key={group.title} className="mb-4">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group.title}</p>
              <div className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href
                  return (
                    <Link key={href} href={href}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                        active
                          ? 'bg-teal-50 text-teal-800 font-semibold'
                          : 'text-slate-500 font-medium hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      <Icon size={16} className={active ? 'text-teal-600' : 'text-slate-400'} />
                      <span className="flex-1">{label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
      <div className="px-5 py-3 border-t border-slate-100">
        <p className="text-slate-300 text-xs">v2.0.0 · Web</p>
      </div>
    </aside>
  )
}
