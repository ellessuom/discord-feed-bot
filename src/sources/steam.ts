import { NewsItem } from '../types'
import { SteamGameSource, SteamNewsSource, SteamSalesSource } from './types'
import Parser from 'rss-parser'
import { withRetry } from '../utils/retry'

const parser = new Parser()

const STEAM_NEWS_URL = 'https://store.steampowered.com/feeds/news/'
const STEAM_APP_NEWS_URL = 'https://store.steampowered.com/feeds/news/app/'

function parseRssItems(items: Parser.Item[] | undefined, sourceId: string): NewsItem[] {
  if (!items) return []

  const parsed: (NewsItem | null)[] = items.map((item) => {
    const rawItem = item as Parser.Item & { id?: string; 'content:encoded'?: string }
    const id = item.guid ?? rawItem.id ?? item.link
    if (!id) {
      console.warn(`[${sourceId}] Item missing ID, skipping: ${item.title ?? 'Untitled'}`)
      return null
    }

    const content = item.content ?? rawItem['content:encoded']
    const imageUrl = item.enclosure?.url

    const newsItem: NewsItem = {
      id,
      title: item.title ?? 'Untitled',
      url: item.link ?? '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      source: sourceId,
    }

    if (content) {
      newsItem.content = content
    }

    if (imageUrl) {
      newsItem.image = imageUrl
    }

    return newsItem
  })

  return parsed.filter((item): item is NewsItem => item !== null)
}

export async function fetchGameNews(source: SteamGameSource): Promise<NewsItem[]> {
  const feed = await withRetry(
    () => parser.parseURL(`${STEAM_APP_NEWS_URL}${source.appid}/`),
    { retries: 2, baseDelayMs: 500 },
    { operation: `fetchGameNews(${source.name})` }
  )
  return parseRssItems(feed.items, source.id)
}

export async function fetchSteamNews(source: SteamNewsSource): Promise<NewsItem[]> {
  const feed = await withRetry(
    () => parser.parseURL(STEAM_NEWS_URL),
    { retries: 2, baseDelayMs: 500 },
    { operation: 'fetchSteamNews' }
  )
  return parseRssItems(feed.items, source.id)
}

interface SteamSaleItem {
  id: number
  name: string
  discount_percent: number
  original_price?: number
  final_price?: number
  header_image?: string
}

interface SteamFeaturedCategories {
  specials?: {
    items: SteamSaleItem[]
  }
}

export async function fetchSteamSales(_source: SteamSalesSource): Promise<NewsItem[]> {
  const data = await withRetry(
    async () => {
      const response = await fetch('https://store.steampowered.com/api/featuredcategories/')
      if (!response.ok) {
        throw new Error(`Steam API error: ${response.status}`)
      }
      return response.json() as Promise<SteamFeaturedCategories>
    },
    { retries: 2, baseDelayMs: 500 },
    { operation: 'fetchSteamSales' }
  )

  const specials = data.specials?.items || []

  if (!Array.isArray(specials) || specials.length === 0) {
    return []
  }

  return specials.slice(0, 20).map((item): NewsItem => {
    const newsItem: NewsItem = {
      id: `sale_${item.id}`,
      title: `${item.name} - ${item.discount_percent}% OFF`,
      url: `https://store.steampowered.com/app/${item.id}/`,
      publishedAt: new Date(),
      source: _source.id,
      content: `${item.discount_percent}% OFF — ${((item.original_price ?? 0) / 100).toFixed(2)} → ${((item.final_price ?? 0) / 100).toFixed(2)}`,
    }

    if (item.header_image) {
      newsItem.image = item.header_image
    }

    return newsItem
  })
}
