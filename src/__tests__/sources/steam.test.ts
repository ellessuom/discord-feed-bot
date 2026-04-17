import { describe, test, expect } from 'vitest'
import { fetchGameNews, fetchSteamNews } from '../../sources/steam'
import type { SteamGameSource, SteamNewsSource } from '../../sources/types'

describe('Steam source handler', () => {
  describe('fetchGameNews', () => {
    test(
      'fetches CS2 news from Steam RSS for game 730',
      async () => {
        const source: SteamGameSource = {
          id: 'steam-cs2',
          type: 'steam_game',
          name: 'Counter-Strike 2',
          appid: 730,
        }

        const items = await fetchGameNews(source)

        expect(Array.isArray(items)).toBe(true)
        expect(items.length).toBeGreaterThan(0)

        const item = items[0]!
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('title')
        expect(item).toHaveProperty('url')
        expect(item).toHaveProperty('publishedAt')
        expect(item).toHaveProperty('source')
        expect(item.source).toBe('steam-cs2')
        expect(item.url).toContain('steampowered.com')
      },
      { retry: 2, timeout: 15000 }
    )

    test(
      'returns empty array for invalid appid without throwing',
      async () => {
        const source: SteamGameSource = {
          id: 'steam-invalid',
          type: 'steam_game',
          name: 'Invalid Game',
          appid: 999999999,
        }

        const items = await fetchGameNews(source)

        expect(Array.isArray(items)).toBe(true)
        expect(items.length).toBe(0)
      },
      { retry: 2, timeout: 15000 }
    )
  })

  describe('fetchSteamNews', () => {
    test(
      'fetches general Steam news feed',
      async () => {
        const source: SteamNewsSource = {
          id: 'steam-news',
          type: 'steam_news',
          name: 'Steam News',
        }

        const items = await fetchSteamNews(source)

        expect(Array.isArray(items)).toBe(true)
        expect(items.length).toBeGreaterThan(0)

        const item = items[0]!
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('title')
        expect(item).toHaveProperty('url')
        expect(item).toHaveProperty('publishedAt')
        expect(item).toHaveProperty('source')
        expect(item.source).toBe('steam-news')
      },
      { retry: 2, timeout: 15000 }
    )
  })

  describe('response structure validation', () => {
    test(
      'items have required fields with correct types',
      async () => {
        const source: SteamGameSource = {
          id: 'steam-cs2-struct',
          type: 'steam_game',
          name: 'Counter-Strike 2',
          appid: 730,
        }

        const items = await fetchGameNews(source)

        for (const item of items) {
          expect(typeof item.id).toBe('string')
          expect(typeof item.title).toBe('string')
          expect(typeof item.url).toBe('string')
          expect(item.publishedAt instanceof Date).toBe(true)
          expect(typeof item.source).toBe('string')
        }
      },
      { retry: 2, timeout: 15000 }
    )

    test(
      'optional content and image fields when present',
      async () => {
        const source: SteamGameSource = {
          id: 'steam-cs2-optional',
          type: 'steam_game',
          name: 'Counter-Strike 2',
          appid: 730,
        }

        const items = await fetchGameNews(source)
        const itemsWithContent = items.filter((i) => i.content)
        const itemsWithImage = items.filter((i) => i.image)

        expect(itemsWithContent.length).toBeGreaterThan(0)

        for (const item of itemsWithContent) {
          expect(typeof item.content).toBe('string')
        }

        for (const item of itemsWithImage) {
          expect(typeof item.image).toBe('string')
          expect(item.image).toMatch(/^https?:\/\//)
        }
      },
      { retry: 2, timeout: 15000 }
    )
  })
})
