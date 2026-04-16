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
  try {
    const feed = await withRetry(
      () => parser.parseURL(`${STEAM_APP_NEWS_URL}${source.appid}/`),
      { retries: 2, baseDelayMs: 500 },
      { operation: `fetchGameNews(${source.name})` }
    )
    return parseRssItems(feed.items, source.id)
  } catch (error) {
    console.error(`Error fetching news for ${source.name} (appid: ${source.appid}):`, error)
    return []
  }
}

export async function fetchSteamNews(source: SteamNewsSource): Promise<NewsItem[]> {
  try {
    const feed = await withRetry(
      () => parser.parseURL(STEAM_NEWS_URL),
      { retries: 2, baseDelayMs: 500 },
      { operation: 'fetchSteamNews' }
    )
    return parseRssItems(feed.items, source.id)
  } catch (error) {
    console.error('Error fetching Steam news:', error)
    return []
  }
}

export async function fetchSteamSales(_source: SteamSalesSource): Promise<NewsItem[]> {
  console.warn('Steam sales source type is not yet implemented')
  return []
}
