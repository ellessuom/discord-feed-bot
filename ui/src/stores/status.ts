import { create } from 'zustand'
import { GitHubAPI, type Status } from '@/integrations/github'
import { getGitHubPAT } from '@/utils/storage'

interface StatusState {
  status: Status | null
  isLoading: boolean
  error: string | null

  fetchStatus: () => Promise<void>
  clearError: () => void
}

export const useStatusStore = create<StatusState>((set) => ({
  status: null,
  isLoading: false,
  error: null,

  fetchStatus: async () => {
    const token = getGitHubPAT()
    if (!token) {
      set({ error: 'No GitHub PAT found', status: null, isLoading: false })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const api = new GitHubAPI(token)
      const status = await api.getStatus()
      set({ status, isLoading: false })
    } catch {
      set({
        status: null,
        error: 'Failed to fetch status',
        isLoading: false,
      })
    }
  },

  clearError: () => set({ error: null }),
}))
