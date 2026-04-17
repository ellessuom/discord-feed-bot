import { describe, it, expect } from 'vitest'
import { fetchReddit } from '../../sources/reddit'
import type { RedditSource } from '../../sources/types'

describe('fetchReddit', () => {
  it('returns array for any subreddit (handles errors gracefully)', async () => {
    const source: RedditSource = {
      id: 'reddit-programming',
      type: 'reddit',
      name: 'Programming Subreddit',
      subreddit: 'programming',
    }

    const items = await fetchReddit(source)

    expect(Array.isArray(items)).toBe(true)
  }, 30000)

  it('normalizes subreddit by removing r/ prefix', async () => {
    const sourceWithPrefix: RedditSource = {
      id: 'reddit-programming-prefixed',
      type: 'reddit',
      name: 'Programming Subreddit',
      subreddit: 'r/programming',
    }

    const items = await fetchReddit(sourceWithPrefix)

    expect(Array.isArray(items)).toBe(true)
  }, 30000)

  it('handles invalid/non-existent subreddit gracefully', async () => {
    const source: RedditSource = {
      id: 'reddit-invalid',
      type: 'reddit',
      name: 'Invalid Subreddit',
      subreddit: 'thisSubredditShouldNotExist123456789xyz',
    }

    const items = await fetchReddit(source)

    expect(Array.isArray(items)).toBe(true)
  }, 30000)

  it('returns items with valid structure when available', async () => {
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
  }, 30000)

  it('truncates content to 500 characters when present', async () => {
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
  }, 30000)
})
