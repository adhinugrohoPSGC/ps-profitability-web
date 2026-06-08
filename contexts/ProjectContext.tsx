'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

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
  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => useContext(ProjectContext)
