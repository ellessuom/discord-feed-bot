import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { z } from 'zod'

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

const SteamNewsSourceSchema = z.object({
  enabled: z.boolean(),
})

const GameSourceSchema = z.object({
  appid: z.number().int().positive('Game AppID must be a positive integer'),
  name: z.string().min(1, 'Game name is required'),
})

const SettingsSchema = z.object({
  max_posts_per_run: z.number().int().min(1).max(100).default(10),
  include_images: z.boolean().default(true),
  post_order: z.enum(['newest_first', 'oldest_first']).default('newest_first'),
})

const ConfigSchema = z.object({
  discord: DiscordConfigSchema,
  sources: z.object({
    steam_news: SteamNewsSourceSchema,
    games: z.array(GameSourceSchema).default([]),
  }),
  settings: SettingsSchema.optional(),
})

export type Config = z.infer<typeof ConfigSchema>

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

  return result.data
}
