import { describe, it, expect } from 'vitest'
import { fetchRSS } from '../../sources/rss'
import type { RSSSource } from '../../sources/types'

describe('fetchRSS', () => {
  it('fetches from Daring Fireball RSS feed (real network)', async () => {
    const source: RSSSource = {
      id: 'daringfireball',
      type: 'rss',
      name: 'Daring Fireball',
      url: 'https://daringfireball.net/feeds/main',
    }

    const items = await fetchRSS(source)

    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThan(0)

    const item = items[0]!
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('title')
    expect(item).toHaveProperty('url')
    expect(item).toHaveProperty('publishedAt')
    expect(item).toHaveProperty('source')
    expect(item.source).toBe('daringfireball')
    expect(item.publishedAt).toBeInstanceOf(Date)
  }, 30000)

  it('parses RSS 2.0 format correctly', async () => {
    const source: RSSSource = {
      id: 'npr-news',
      type: 'rss',
      name: 'NPR News',
      url: 'https://feeds.npr.org/1001/rss.xml',
    }

    const items = await fetchRSS(source)

    expect(Array.isArray(items)).toBe(true)

    for (const item of items) {
      expect(typeof item.id).toBe('string')
      expect(typeof item.title).toBe('string')
      expect(typeof item.url).toBe('string')
      expect(item.url.startsWith('http')).toBe(true)
    }
  }, 30000)

  it('propagates errors for invalid URL', async () => {
    const source: RSSSource = {
      id: 'invalid-rss',
      type: 'rss',
      name: 'Invalid Feed',
      url: 'https://thisurldoesnotexist123456789.invalid/rss.xml',
    }

    await expect(fetchRSS(source)).rejects.toThrow(/Failed after 3 attempts/)
  }, 30000)

  it('propagates errors for malformed URL', async () => {
    const source: RSSSource = {
      id: 'malformed-rss',
      type: 'rss',
      name: 'Malformed URL',
      url: 'not-a-valid-url',
    }

    await expect(fetchRSS(source)).rejects.toThrow(/Failed after 3 attempts/)
  }, 30000)

  it('returns items with valid structure', async () => {
    const source: RSSSource = {
      id: 'structure-test',
      type: 'rss',
      name: 'Daring Fireball',
      url: 'https://daringfireball.net/feeds/main',
    }

    const items = await fetchRSS(source)

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

  it('truncates content to 2000 characters when present', async () => {
    const source: RSSSource = {
      id: 'content-test',
      type: 'rss',
      name: 'Daring Fireball',
      url: 'https://daringfireball.net/feeds/main',
    }

    const items = await fetchRSS(source)

    const itemsWithContent = items.filter((item) => item.content)
    for (const item of itemsWithContent) {
      if (typeof item.content === 'string') {
        expect(item.content.length).toBeLessThanOrEqual(2000)
      }
    }
  }, 30000)

  it('handles feeds with podcast enclosures', async () => {
    const source: RSSSource = {
      id: 'podcast-test',
      type: 'rss',
      name: 'Podcast',
      url: 'https://feeds.npr.org/510289/podcast.xml',
    }

    const items = await fetchRSS(source)

    expect(Array.isArray(items)).toBe(true)

    const itemsWithImages = items.filter((item) => item.image)
    if (itemsWithImages.length > 0) {
      for (const item of itemsWithImages) {
        expect(typeof item.image).toBe('string')
        expect(item.image!.startsWith('http')).toBe(true)
      }
    }
  }, 30000)
})
