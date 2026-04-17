import { create } from 'zustand'
import type { Source, Config } from '@/types/sources'
import { GitHubAPI, parseConfig, serializeConfig } from '@/integrations/github'
import { getGitHubPAT } from '@/utils/storage'

interface SourcesState {
  sources: Source[]
  config: Config | null
  configSha: string | null
  isLoading: boolean
  error: string | null

  fetchConfig: () => Promise<void>
  addSource: (source: Source) => Promise<void>
  removeSource: (id: string) => Promise<void>
  updateSource: (source: Source) => Promise<void>
  toggleSourceEnabled: (id: string) => Promise<void>
  updateDiscordWebhook: (webhookUrl: string) => Promise<void>
  updateSettings: (settings: Partial<Config['settings']>) => Promise<void>
  clearError: () => void
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
  sources: [],
  config: null,
  configSha: null,
  isLoading: false,
  error: null,

  fetchConfig: async () => {
    const token = getGitHubPAT()
    if (!token) {
      set({ error: 'No GitHub PAT found. Please configure in Settings.', isLoading: false })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const api = new GitHubAPI(token)
      const { content, sha } = await api.getConfig()
      const config = parseConfig(content)
      set({ sources: config.sources, config, configSha: sha, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load config',
        isLoading: false,
      })
    }
  },

  addSource: async (source: Source) => {
    const { config, configSha } = get()
    if (!config || !configSha) {
      set({ error: 'No config loaded' })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const token = getGitHubPAT()
      if (!token) throw new Error('No GitHub PAT found')

      const newConfig = {
        ...config,
        sources: [...config.sources, source],
      }

      const yamlContent = serializeConfig(newConfig)
      const api = new GitHubAPI(token)
      await api.saveConfig(yamlContent, configSha)

      await get().fetchConfig()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to add source',
        isLoading: false,
      })
    }
  },

  removeSource: async (id: string) => {
    const { config, configSha } = get()
    if (!config || !configSha) {
      set({ error: 'No config loaded' })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const token = getGitHubPAT()
      if (!token) throw new Error('No GitHub PAT found')

      const newConfig = {
        ...config,
        sources: config.sources.filter((s) => s.id !== id),
      }

      const yamlContent = serializeConfig(newConfig)
      const api = new GitHubAPI(token)
      await api.saveConfig(yamlContent, configSha)

      set({ sources: newConfig.sources })
      await get().fetchConfig()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove source',
        isLoading: false,
      })
    }
  },

  updateSource: async (source: Source) => {
    const { config, configSha } = get()
    if (!config || !configSha) {
      set({ error: 'No config loaded' })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const token = getGitHubPAT()
      if (!token) throw new Error('No GitHub PAT found')

      const newConfig = {
        ...config,
        sources: config.sources.map((s) => (s.id === source.id ? source : s)),
      }

      const yamlContent = serializeConfig(newConfig)
      const api = new GitHubAPI(token)
      await api.saveConfig(yamlContent, configSha)

      await get().fetchConfig()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update source',
        isLoading: false,
      })
    }
  },

  toggleSourceEnabled: async (id: string) => {
    const { sources, updateSource } = get()
    const source = sources.find((s) => s.id === id)
    if (!source) return

    await updateSource({ ...source, enabled: !source.enabled })
  },

  updateDiscordWebhook: async (webhookUrl: string) => {
    const { config, configSha } = get()
    if (!config || !configSha) {
      set({ error: 'No config loaded' })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const token = getGitHubPAT()
      if (!token) throw new Error('No GitHub PAT found')

      const newConfig = {
        ...config,
        discord: { webhook_url: webhookUrl },
      }

      const yamlContent = serializeConfig(newConfig)
      const api = new GitHubAPI(token)
      await api.saveConfig(yamlContent, configSha)

      await get().fetchConfig()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update webhook',
        isLoading: false,
      })
    }
  },

  updateSettings: async (settings: Partial<Config['settings']>) => {
    const { config, configSha } = get()
    if (!config || !configSha) {
      set({ error: 'No config loaded' })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const token = getGitHubPAT()
      if (!token) throw new Error('No GitHub PAT found')

      const newConfig = {
        ...config,
        settings: { ...config.settings, ...settings },
      }

      const yamlContent = serializeConfig(newConfig)
      const api = new GitHubAPI(token)
      await api.saveConfig(yamlContent, configSha)

      await get().fetchConfig()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update settings',
        isLoading: false,
      })
    }
  },

  clearError: () => set({ error: null }),
}))
