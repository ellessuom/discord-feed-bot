import { NewsItem } from '../types'
import { RSSSource } from './types'
import Parser from 'rss-parser'
import { withRetry } from '../utils/retry'

const parser = new Parser()

function parseRSSItems(items: Parser.Item[] | undefined, sourceId: string): NewsItem[] {
  if (!items) return []

  const parsed: (NewsItem | null)[] = items.map((item) => {
    const rawItem = item as Parser.Item & { 'content:encoded'?: string }
    const id = item.guid ?? item.link
    if (!id) {
      console.warn(`[${sourceId}] Item missing ID, skipping: ${item.title ?? 'Untitled'}`)
      return null
    }

    const itunesImage = (item as Record<string, unknown>)['itunes:image'] as
      | { href?: string }
      | undefined
    const content = item.content ?? rawItem['content:encoded'] ?? item.contentSnippet
    const imageUrl = item.enclosure?.url ?? itunesImage?.href

    const newsItem: NewsItem = {
      id,
      title: item.title ?? 'Untitled',
      url: item.link ?? '',
      publishedAt: item.pubDate
        ? new Date(item.pubDate)
        : item.isoDate
          ? new Date(item.isoDate)
          : new Date(),
      source: sourceId,
    }

    if (content) {
      newsItem.content = typeof content === 'string' ? content.slice(0, 2000) : content
    }

    if (imageUrl) {
      newsItem.image = imageUrl
    }

    return newsItem
  })

  return parsed.filter((item): item is NewsItem => item !== null)
}

export async function fetchRSS(source: RSSSource): Promise<NewsItem[]> {
  try {
    const feed = await withRetry(
      () => parser.parseURL(source.url),
      { retries: 2, baseDelayMs: 1000 },
      { operation: `fetchRSS(${source.name})` }
    )
    return parseRSSItems(feed.items, source.id)
  } catch (error) {
    console.error(`Error fetching RSS feed ${source.name}:`, error)
    return []
  }
}
