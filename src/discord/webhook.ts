import { NewsItem } from '../types'
import { withRetry } from '../utils/retry'
import { htmlToText } from '../utils/html-to-text'

const DISCORD_EMBED_COLOR = 5814783
const DISCORD_MAX_DESCRIPTION = 4096

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
  thumbnail?: {
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

export async function postNews(
  item: NewsItem,
  webhookUrl: string,
  options: { includeImages?: boolean; sourceName?: string } = {}
): Promise<void> {
  const { includeImages = true, sourceName = 'Steam News' } = options

  const title =
    item.title.length > 256 ? `${item.title.substring(0, 253)}...` : item.title

  const embed: DiscordEmbed = {
    title,
    url: item.url,
    color: DISCORD_EMBED_COLOR,
    timestamp: item.publishedAt.toISOString(),
    author: {
      name: sourceName,
    },
    footer: {
      text: sourceName,
    },
  }

  if (includeImages && item.image) {
    embed.thumbnail = {
      url: item.image,
    }
  }

  if (item.content) {
    embed.description = htmlToText(item.content, DISCORD_MAX_DESCRIPTION)
  }

  const payload: DiscordWebhookPayload = {
    embeds: [embed],
  }

  await withRetry(
    async () => {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status} ${response.statusText}`)
      }

      console.log(`Posted: ${title}`)
    },
    { retries: 2, baseDelayMs: 1000 },
    { operation: `postNews(${title})` }
  )
}
