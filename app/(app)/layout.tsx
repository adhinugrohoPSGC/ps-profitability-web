import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { ToastProvider } from '@/components/Toast'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { PresenceHeartbeat } from '@/components/PresenceHeartbeat'
import { getCaller } from '@/lib/permissions'
import { MENUS } from '@/lib/menus'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const caller = await getCaller() // null → proxy already redirected to /login
  const isAdmin = !!caller?.isAdmin
  const allowedMenus = isAdmin
    ? undefined // undefined = all menus
    : MENUS.map(m => m.key as string).filter(k => !!caller?.can(k))
  const showUsers = !!caller?.can('users.view')

  return (
    <ToastProvider>
      <ProjectProvider>
        <PresenceHeartbeat />
        <div className="flex h-screen overflow-hidden bg-gray-50">
          <Sidebar allowedMenus={allowedMenus} showUsers={showUsers} />
          <div className="flex flex-col flex-1 overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-auto p-6">{children}</main>
          </div>
        </div>
      </ProjectProvider>
    </ToastProvider>
  )
}
