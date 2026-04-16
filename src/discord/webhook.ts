import { NewsItem } from './types.js'

const DISCORD_EMBED_COLOR = 5814783 // Steam-like blue

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

  const embed: DiscordEmbed = {
    title: item.title,
    url: item.url,
    color: DISCORD_EMBED_COLOR,
    timestamp: item.publishedAt.toISOString(),
    author: {
      name: 'Steam News',
      url: 'https://store.steampowered.com/',
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
    const maxLength = 4096
    const content = item.content.replace(/<[^>]*>/g, '') // Strip HTML tags
    embed.description = content.substring(0, maxLength)
    if (content.length > maxLength) {
      embed.description += '...'
    }
  }

  const payload: DiscordWebhookPayload = {
    embeds: [embed],
  }

  try {
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

    console.log(`Posted: ${item.title}`)
  } catch (error) {
    console.error(`Failed to post "${item.title}":`, error)
    throw error
  }
}
