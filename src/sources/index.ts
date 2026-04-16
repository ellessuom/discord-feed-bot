import type { NewsItem } from '../types'
import type { Source } from './types'
import { fetchGameNews, fetchSteamNews, fetchSteamSales } from './steam'
import { fetchReddit } from './reddit'
import { fetchRSS } from './rss'
import { fetchGitHub } from './github'

export async function dispatchSource(source: Source): Promise<NewsItem[]> {
  switch (source.type) {
    case 'steam_game':
      return fetchGameNews(source)
    case 'steam_news':
      return fetchSteamNews(source)
    case 'steam_sales':
      return fetchSteamSales(source)
    case 'reddit':
      return fetchReddit(source)
    case 'rss':
      return fetchRSS(source)
    case 'github':
      return fetchGitHub(source)
    default: {
      console.error(`Unknown source type: ${(source as Source).type}`)
      return []
    }
  }
}

export function getSourceName(source: Source): string {
  return source.name
}

export function getAuthorName(source: Source): string {
  switch (source.type) {
    case 'steam_game':
      return 'Steam News'
    case 'steam_news':
      return 'Steam'
    case 'steam_sales':
      return 'Steam'
    case 'reddit':
      return `r/${source.subreddit}`
    case 'rss':
      try {
        return new URL(source.url).hostname
      } catch {
        return source.name
      }
    case 'github':
      return `${source.owner}/${source.repo}`
    default: {
      return 'Unknown'
    }
  }
}
