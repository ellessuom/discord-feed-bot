import { create } from 'zustand'
import { GitHubAPI } from '@/integrations/github'
import { getGitHubPAT, setGitHubPAT, removeGitHubPAT } from '@/utils/storage'

interface GitHubState {
  isAuthenticated: boolean
  user: { login: string; name: string | null } | null
  isLoading: boolean
  error: string | null

  setPAT: (token: string) => Promise<void>
  clearPAT: () => void
  validatePAT: () => Promise<boolean>
  triggerWorkflow: () => Promise<void>
}

export const useGitHubStore = create<GitHubState>((set) => ({
  isAuthenticated: false,
  user: null,
  isLoading: false,
  error: null,

  setPAT: async (token: string) => {
    set({ isLoading: true, error: null })
    try {
      setGitHubPAT(token)
      const api = new GitHubAPI(token)
      const user = await api.validateToken()
      if (user) {
        set({ isAuthenticated: true, user, isLoading: false })
      } else {
        removeGitHubPAT()
        set({ isAuthenticated: false, user: null, error: 'Invalid PAT', isLoading: false })
      }
    } catch (error) {
      removeGitHubPAT()
      set({
        error: error instanceof Error ? error.message : 'Failed to validate PAT',
        isLoading: false,
        isAuthenticated: false,
        user: null,
      })
    }
  },

  clearPAT: () => {
    removeGitHubPAT()
    set({ isAuthenticated: false, user: null, error: null })
  },

  validatePAT: async () => {
    const token = getGitHubPAT()
    if (!token) {
      set({ isAuthenticated: false, user: null })
      return false
    }

    set({ isLoading: true, error: null })
    try {
      const api = new GitHubAPI(token)
      const user = await api.validateToken()
      if (user) {
        set({ isAuthenticated: true, user, isLoading: false })
        return true
      }
      set({ isAuthenticated: false, user: null, isLoading: false })
      return false
    } catch {
      set({ isAuthenticated: false, user: null, isLoading: false })
      return false
    }
  },

  triggerWorkflow: async () => {
    const token = getGitHubPAT()
    if (!token) {
      set({ error: 'No GitHub PAT found' })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const api = new GitHubAPI(token)
      await api.triggerWorkflow()
      set({ isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to trigger workflow',
        isLoading: false,
      })
    }
  },
}))
