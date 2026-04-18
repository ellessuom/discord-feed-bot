import { NewsItem } from '../types'
import { RedditSource } from './types'
import Parser from 'rss-parser'
import { withRetry } from '../utils/retry'

const parser = new Parser()

function parseRedditItems(items: Parser.Item[] | undefined, sourceId: string): NewsItem[] {
  if (!items) return []

  const parsed: (NewsItem | null)[] = items.map((item) => {
    const id = item.guid ?? item.link
    if (!id) {
      console.warn(`[${sourceId}] Item missing ID, skipping: ${item.title ?? 'Untitled'}`)
      return null
    }

    const newsItem: NewsItem = {
      id,
      title: item.title ?? 'Untitled',
      url: item.link ?? '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      source: sourceId,
    }

    if (item.contentSnippet) {
      newsItem.content = item.contentSnippet.slice(0, 500)
    }

    return newsItem
  })

  return parsed.filter((item): item is NewsItem => item !== null)
}

export async function fetchReddit(source: RedditSource): Promise<NewsItem[]> {
  const subreddit = source.subreddit.replace(/^r\//, '')
  const url = `https://www.reddit.com/r/${subreddit}/.rss`

  const feed = await withRetry(
    () => parser.parseURL(url),
    { retries: 2, baseDelayMs: 1000 },
    { operation: `fetchReddit(${subreddit})` }
  )
  return parseRedditItems(feed.items, source.id)
}
