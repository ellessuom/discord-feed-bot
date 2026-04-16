import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

interface DiscordConfig {
  webhook_url: string
}

interface SteamSource {
  enabled: boolean
}

interface GameSource {
  appid: number
  name: string
}

interface Settings {
  max_posts_per_run: number
  include_images: boolean
  post_order: 'newest_first' | 'oldest_first'
}

export interface Config {
  discord: DiscordConfig
  sources: {
    steam_news: SteamSource
    games: GameSource[]
  }
  settings: Settings
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..')

export function loadConfig(): Config {
  const configPath = path.resolve(projectRoot, 'config.yaml')
  const configContent = fs.readFileSync(configPath, 'utf-8')
  const config = yaml.load(configContent) as Config

  // Replace environment variable placeholders
  if (config.discord.webhook_url.includes('${DISCORD_WEBHOOK_URL}')) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL
    if (!webhookUrl) {
      throw new Error('DISCORD_WEBHOOK_URL environment variable is not set')
    }
    config.discord.webhook_url = webhookUrl
  }

  return config
}
