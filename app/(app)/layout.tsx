import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { ToastProvider } from '@/components/Toast'
import { ProjectProvider } from '@/contexts/ProjectContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
