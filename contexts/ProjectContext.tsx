'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface ProjectContextValue {
  selectedProject: string | null
  setSelectedProject: (id: string | null) => void
}

const ProjectContext = createContext<ProjectContextValue>({
  selectedProject: null,
  setSelectedProject: () => {},
})

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  // Deep link: ?project=<id> preselects a project (used by the PSGC Project
  // Tracker's "Open Project Profitability Dashboard" link). Read after mount
  // to avoid an SSR/hydration mismatch.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('project')
    if (fromUrl) setSelectedProject(fromUrl)
  }, [])

  // Keep the URL shareable when the user switches projects in the top bar.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedProject) url.searchParams.set('project', selectedProject)
    else url.searchParams.delete('project')
    window.history.replaceState(null, '', url.toString())
  }, [selectedProject])

  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => useContext(ProjectContext)
