import { NewsItem } from '../types'
import { withRetry } from '../utils/retry'
import { htmlToText } from '../utils/html-to-text'

const DESCRIPTION_MAX = 300

const SOURCE_COLORS: Record<string, number> = {
  steam_game: 0x1b2838,
  steam_news: 0x1b2838,
  steam_sales: 0x1b2838,
  reddit: 0xff4500,
  rss: 0x2196f3,
  github: 0x24292e,
}

const SOURCE_ICONS: Record<string, string> = {
  steam_game: 'https://store.steampowered.com/favicon.ico',
  steam_news: 'https://store.steampowered.com/favicon.ico',
  steam_sales: 'https://store.steampowered.com/favicon.ico',
  reddit: 'https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png',
  github: 'https://github.githubassets.com/favicons/favicon-dark.png',
}

const SOURCE_LABELS: Record<string, string> = {
  steam_game: 'Steam',
  steam_news: 'Steam News',
  steam_sales: 'Steam Sales',
  reddit: 'Reddit',
  rss: 'RSS',
  github: 'GitHub',
}

interface DiscordEmbed {
  title: string
  url?: string
  description?: string
  color?: number
  timestamp?: string
  author?: {
    name: string
    url?: string
    icon_url?: string
  }
  image?: {
    url: string
  }
  footer?: {
    text: string
    icon_url?: string
  }
}

interface DiscordWebhookPayload {
  embeds: DiscordEmbed[]
}

export interface BuildEmbedOptions {
  includeImages?: boolean
  sourceName?: string
  sourceType?: string
}

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_MAX) return text
  const truncated = text.slice(0, DESCRIPTION_MAX - 1)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > DESCRIPTION_MAX * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '\u2026'
}

export function buildEmbed(item: NewsItem, options: BuildEmbedOptions = {}): DiscordEmbed {
  const { includeImages = true, sourceName = 'News', sourceType = 'rss' } = options

  const title =
    item.title.length > 256 ? `${item.title.substring(0, 253)}...` : item.title

  const color = SOURCE_COLORS[sourceType] ?? 0x2196f3
  const icon = SOURCE_ICONS[sourceType]
  const label = SOURCE_LABELS[sourceType] ?? 'News'

  const author: DiscordEmbed['author'] = { name: label }
  if (icon) {
    author.icon_url = icon
  }

  const embed: DiscordEmbed = {
    title,
    url: item.url,
    color,
    timestamp: item.publishedAt.toISOString(),
    author,
  }

  if (sourceName !== label) {
    embed.footer = { text: sourceName }
  }

  if (includeImages && item.image) {
    embed.image = { url: item.image }
  }

  const rawDescription = item.snippet ?? item.content
  if (rawDescription) {
    const cleaned = htmlToText(rawDescription, DESCRIPTION_MAX + 100)
    embed.description = truncateDescription(cleaned)
  }

  return embed
}

export async function postEmbeds(
  embeds: DiscordEmbed[],
  webhookUrl: string,
): Promise<void> {
  if (embeds.length === 0) return

  const payload: DiscordWebhookPayload = { embeds }

  await withRetry(
    async () => {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status} ${response.statusText}`)
      }

      console.log(`Posted batch of ${embeds.length} embed(s)`)
    },
    { retries: 2, baseDelayMs: 1000 },
    { operation: `postEmbeds(${embeds.length} embeds)` },
  )
}
