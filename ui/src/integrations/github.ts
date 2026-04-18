import * as yaml from 'yaml'
import type { Config, Source, Settings } from '@/types/sources'
import { REPO_OWNER, REPO_NAME } from '@/utils/env'
import { safeBase64Encode } from '@/utils/encoding'

const CONFIG_PATH = 'config.yaml'
const STATUS_PATH = 'data/status.json'

export interface StatusError {
  source: string
  message: string
  time: string
}

export interface Status {
  lastRun: string | null
  success: boolean
  postsCount: number
  sourcesCount: number
  errors: StatusError[]
  nextRun: string | null
}

interface GitHubFile {
  content: string
  sha: string
}

function getHeaders(token: string): HeadersInit {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }
}

export class GitHubAPI {
  private token: string

  constructor(token: string) {
    this.token = token
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: getHeaders(this.token),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(error.message || `GitHub API error: ${response.status}`)
    }

    return response.json()
  }

  async validateToken(): Promise<{ login: string; name: string | null } | null> {
    try {
      const user = await this.fetch<{ login: string; name: string | null }>('/user')
      return user
    } catch {
      return null
    }
  }

  async getFile(path: string): Promise<GitHubFile> {
    const data = await this.fetch<{ content: string; sha: string }>(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`
    )
    return {
      content: atob(data.content.replace(/\n/g, '')),
      sha: data.sha,
    }
  }

  async saveFile(path: string, content: string, sha: string, message: string): Promise<void> {
    await this.fetch(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: safeBase64Encode(content),
        sha,
      }),
    })
  }

  async getConfig(): Promise<{ content: string; sha: string }> {
    return this.getFile(CONFIG_PATH)
  }

  async saveConfig(content: string, sha: string): Promise<void> {
    return this.saveFile(CONFIG_PATH, content, sha, 'Update config via UI')
  }

  async triggerWorkflow(workflow: string = 'feed.yml'): Promise<void> {
    await this.fetch(`/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'main' }),
    })
  }

  async getStatus(): Promise<Status> {
    const data = await this.fetch<{ content: string }>(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${STATUS_PATH}`
    )
    const content = atob(data.content.replace(/\n/g, ''))
    return JSON.parse(content) as Status
  }

  async getWorkflowRuns(): Promise<
    { id: number; status: string; conclusion: string | null; created_at: string }[]
  > {
    const data = await this.fetch<{
      workflow_runs: Array<{
        id: number
        status: string
        conclusion: string | null
        created_at: string
      }>
    }>(`/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/feed.yml/runs?per_page=5`)
    return data.workflow_runs
  }
}

interface RawSource {
  id?: string
  type?: string
  name?: string
  enabled?: boolean
  appid?: number
  subreddit?: string
  url?: string
  owner?: string
  repo?: string
}

interface RawConfig {
  discord?: {
    webhook_url?: string
  }
  sources?: RawSource[]
  settings?: Partial<Settings>
}

function validateSource(source: RawSource, index: number): Source {
  if (!source.id) {
    throw new Error(`Invalid config: source at index ${index} missing required field 'id'`)
  }
  if (!source.type) {
    throw new Error(`Invalid config: source '${source.id}' missing required field 'type'`)
  }
  if (!source.name) {
    throw new Error(`Invalid config: source '${source.id}' missing required field 'name'`)
  }

  const validTypes: Source['type'][] = [
    'steam_game',
    'steam_news',
    'steam_sales',
    'reddit',
    'rss',
    'github',
  ]
  if (!validTypes.includes(source.type as Source['type'])) {
    throw new Error(
      `Invalid config: source '${source.id}' has invalid type '${source.type}'. ` +
        `Valid types: ${validTypes.join(', ')}`
    )
  }

  const base = {
    id: source.id,
    type: source.type as Source['type'],
    name: source.name,
    enabled: source.enabled,
  }

  switch (source.type) {
    case 'steam_game':
      if (source.appid === undefined || source.appid === null) {
        throw new Error(
          `Invalid config: source '${source.id}' of type 'steam_game' missing required field 'appid'`
        )
      }
      return { ...base, type: 'steam_game', appid: source.appid }

    case 'steam_news':
      return { ...base, type: 'steam_news' }

    case 'steam_sales':
      return { ...base, type: 'steam_sales' }

    case 'reddit':
      if (!source.subreddit) {
        throw new Error(
          `Invalid config: source '${source.id}' of type 'reddit' missing required field 'subreddit'`
        )
      }
      return { ...base, type: 'reddit', subreddit: source.subreddit }

    case 'rss':
      if (!source.url) {
        throw new Error(
          `Invalid config: source '${source.id}' of type 'rss' missing required field 'url'`
        )
      }
      return { ...base, type: 'rss', url: source.url }

    case 'github':
      if (!source.owner) {
        throw new Error(
          `Invalid config: source '${source.id}' of type 'github' missing required field 'owner'`
        )
      }
      if (!source.repo) {
        throw new Error(
          `Invalid config: source '${source.id}' of type 'github' missing required field 'repo'`
        )
      }
      return { ...base, type: 'github', owner: source.owner, repo: source.repo }

    default:
      throw new Error(`Invalid config: source '${source.id}' has unhandled type '${source.type}'`)
  }
}

export function parseConfig(yamlContent: string): Config {
  let raw: RawConfig
  try {
    raw = yaml.parse(yamlContent) as RawConfig
  } catch (e) {
    throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : 'Unknown error'}`)
  }

  if (!raw) {
    throw new Error('Invalid config: empty or null YAML content')
  }

  if (!raw.discord?.webhook_url) {
    throw new Error("Invalid config: missing 'discord.webhook_url'")
  }

  const defaultSettings: Settings = {
    max_posts_per_run: 10,
    max_items_per_source: 5,
    include_images: true,
    post_order: 'newest_first',
  }

  const config: Config = {
    discord: {
      webhook_url: raw.discord.webhook_url,
    },
    sources: [],
    settings: {
      ...defaultSettings,
      ...raw.settings,
    },
  }

  if (raw.sources && Array.isArray(raw.sources)) {
    config.sources = raw.sources.map((s, i) => validateSource(s, i))
  }

  return config
}

export function serializeConfig(config: Config): string {
  const raw: RawConfig = {
    discord: {
      webhook_url: config.discord.webhook_url,
    },
    sources: config.sources.map((source) => {
      const base: RawSource = {
        id: source.id,
        type: source.type,
        name: source.name,
      }
      if (source.enabled !== undefined) {
        base.enabled = source.enabled
      }
      return { ...base, ...source }
    }),
    settings: config.settings,
  }

  return yaml.stringify(raw, { lineWidth: 0 })
}
