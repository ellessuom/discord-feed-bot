import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Parser from 'rss-parser'
import { fetchReddit } from '../../sources/reddit'
import type { RedditSource } from '../../sources/types'

const MOCK_RSS_XML = '<rss><channel></channel></rss>'

function mockFetchAndParse(parseResult: { items: Parser.Item[] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(MOCK_RSS_XML),
    }),
  )
  vi.spyOn(Parser.prototype, 'parseString').mockResolvedValue(parseResult)
}

describe('fetchReddit', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(MOCK_RSS_XML),
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches and maps reddit RSS items', async () => {
    mockFetchAndParse({
      items: [
        {
          guid: 'https://reddit.com/r/programming/comments/abc123/title',
          title: 'Hello World',
          link: 'https://reddit.com/r/programming/comments/abc123/title',
          pubDate: 'Mon, 01 Jan 2024 12:00:00 GMT',
          contentSnippet: 'snippet text',
        },
      ],
    })

    const source: RedditSource = {
      id: 'reddit-programming',
      type: 'reddit',
      name: 'Programming Subreddit',
      subreddit: 'programming',
    }

    const items = await fetchReddit(source)

    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBe(1)
    expect(items[0]!.source).toBe('reddit-programming')
    expect(items[0]!.title).toBe('Hello World')
    expect(items[0]!.content).toBe('snippet text')
  })

  it('normalizes subreddit by removing r/ prefix', async () => {
    mockFetchAndParse({ items: [] })

    const source: RedditSource = {
      id: 'reddit-programming-prefixed',
      type: 'reddit',
      name: 'Programming Subreddit',
      subreddit: 'r/programming',
    }

    await fetchReddit(source)

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.reddit.com/r/programming/.rss',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      }),
    )
  })

  it('propagates parser / HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(''),
      }),
    )

    const source: RedditSource = {
      id: 'reddit-invalid',
      type: 'reddit',
      name: 'Invalid Subreddit',
      subreddit: 'thisSubredditShouldNotExist123456789xyz',
    }

    await expect(fetchReddit(source)).rejects.toThrow(/Failed after 3 attempts/)
  })

  it('returns items with valid structure when feed has entries', async () => {
    mockFetchAndParse({
      items: [
        {
          guid: 'g1',
          title: 'T',
          link: 'https://example.com/1',
          pubDate: 'Mon, 01 Jan 2024 12:00:00 GMT',
        },
      ],
    })

    const source: RedditSource = {
      id: 'reddit-technology',
      type: 'reddit',
      name: 'Technology Subreddit',
      subreddit: 'technology',
    }

    const items = await fetchReddit(source)

    expect(Array.isArray(items)).toBe(true)

    for (const item of items) {
      expect(typeof item.id).toBe('string')
      expect(item.id.length).toBeGreaterThan(0)
      expect(typeof item.title).toBe('string')
      expect(item.title.length).toBeGreaterThan(0)
      expect(typeof item.url).toBe('string')
      expect(item.url.length).toBeGreaterThan(0)
      expect(item.publishedAt instanceof Date).toBe(true)
      expect(typeof item.source).toBe('string')
    }
  })

  it('truncates content to 500 characters when present', async () => {
    const longSnippet = 'a'.repeat(600)
    mockFetchAndParse({
      items: [
        {
          guid: 'g2',
          title: 'Long',
          link: 'https://example.com/2',
          pubDate: 'Mon, 01 Jan 2024 12:00:00 GMT',
          contentSnippet: longSnippet,
        },
      ],
    })

    const source: RedditSource = {
      id: 'reddit-news',
      type: 'reddit',
      name: 'News Subreddit',
      subreddit: 'news',
    }

    const items = await fetchReddit(source)

    const itemsWithContent = items.filter((item) => item.content)
    for (const item of itemsWithContent) {
      expect(item.content!.length).toBeLessThanOrEqual(500)
    }
  })
})
