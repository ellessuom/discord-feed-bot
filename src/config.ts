import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { z } from 'zod'
import type { Source } from './sources/types'

const DiscordConfigSchema = z.object({
  webhook_url: z
    .string()
    .min(1, 'Discord webhook URL is required')
    .url('Invalid Discord webhook URL format')
    .refine(
      (url) =>
        url.startsWith('https://discord.com/api/webhooks/') ||
        url.startsWith('https://discordapp.com/api/webhooks/'),
      'Discord webhook URL must start with https://discord.com/api/webhooks/ or https://discordapp.com/api/webhooks/'
    ),
})

const SettingsSchema = z
  .object({
    max_posts_per_run: z.number().int().min(1).max(100).default(10),
    include_images: z.boolean().default(true),
    post_order: z.enum(['newest_first', 'oldest_first']).default('newest_first'),
  })
  .optional()

const SteamGameSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('steam_game'),
  name: z.string().min(1),
  appid: z.number().int().positive(),
  enabled: z.boolean().optional(),
})

const SteamNewsSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('steam_news'),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
})

const SteamSalesSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('steam_sales'),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
})

const RedditSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('reddit'),
  name: z.string().min(1),
  subreddit: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_]+$/, 'Subreddit name can only contain letters, numbers, and underscores'),
  enabled: z.boolean().optional(),
})

const RSSSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('rss'),
  name: z.string().min(1),
  url: z.string().url(),
  enabled: z.boolean().optional(),
})

const GitHubSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('github'),
  name: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  enabled: z.boolean().optional(),
})

const SourceSchema = z.discriminatedUnion('type', [
  SteamGameSourceSchema,
  SteamNewsSourceSchema,
  SteamSalesSourceSchema,
  RedditSourceSchema,
  RSSSourceSchema,
  GitHubSourceSchema,
])

const ConfigSchema = z.object({
  discord: DiscordConfigSchema,
  sources: z.array(SourceSchema),
  settings: SettingsSchema,
})

export interface Settings {
  max_posts_per_run: number
  include_images: boolean
  post_order: 'newest_first' | 'oldest_first'
}

export interface Config {
  discord: {
    webhook_url: string
  }
  sources: Source[]
  settings: Settings
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function substituteEnvVars(value: string): string {
  const envVarPattern = /\$\{([^}]+)\}/g
  return value.replace(envVarPattern, (_, varName) => {
    const envValue = process.env[varName]
    if (!envValue) {
      throw new Error(`Environment variable ${varName} is not set`)
    }
    return envValue
  })
}

function substituteEnvVarsInObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVarsInObject)
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsInObject(value)
    }
    return result
  }
  return obj
}

export function loadConfig(): Config {
  const configPath = path.resolve(projectRoot, 'config.yaml')

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }

  const configContent = fs.readFileSync(configPath, 'utf-8')
  const rawConfig = yaml.load(configContent)

  const configWithEnvVars = substituteEnvVarsInObject(rawConfig)

  const result = ConfigSchema.safeParse(configWithEnvVars)

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n')
    throw new Error(`Config validation failed:\n${errors}`)
  }

  const settings: Settings = {
    max_posts_per_run: result.data.settings?.max_posts_per_run ?? 10,
    include_images: result.data.settings?.include_images ?? true,
    post_order: result.data.settings?.post_order ?? 'newest_first',
  }

  return {
    discord: result.data.discord,
    sources: result.data.sources as Source[],
    settings,
  }
}
