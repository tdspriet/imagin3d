import { createContext, useContext } from 'react'

export const WorkspaceContext = createContext('single')

export function useWorkspaceKey() {
  return useContext(WorkspaceContext)
}
