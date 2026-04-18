import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildEmbed, postEmbeds } from '../../discord/webhook'
import { htmlToText } from '../../utils/html-to-text'
import type { NewsItem } from '../../types'

describe('discord webhook', () => {
  describe('htmlToText', () => {
    test('strips HTML tags', () => {
      expect(htmlToText('<p>Hello World</p>')).toBe('Hello World')
      expect(htmlToText('<div><span>nested</span></div>')).toBe('nested')
      expect(htmlToText('<strong>bold</strong> and <em>italic</em>')).toBe('bold and italic')
    })

    test('removes script tags and content', () => {
      expect(htmlToText('<script>alert("xss")</script>Hello')).toBe('Hello')
      expect(htmlToText('<script type="text/javascript">code</script>text')).toBe('text')
    })

    test('removes style tags and content', () => {
      expect(htmlToText('<style>.foo { color: red; }</style>text')).toBe('text')
    })

    test('removes img tags', () => {
      expect(htmlToText('<img src="test.jpg" alt="test">text')).toBe('text')
      expect(htmlToText('<img src="test.jpg"/>text')).toBe('text')
    })

    test('converts br tags to newlines', () => {
      expect(htmlToText('line1<br>line2')).toBe('line1\nline2')
      expect(htmlToText('line1<br/>line2')).toBe('line1\nline2')
      expect(htmlToText('line1<br />line2')).toBe('line1\nline2')
    })

    test('converts paragraph and div closings to newlines', () => {
      expect(htmlToText('<p>para1</p><p>para2</p>')).toBe('para1\n\npara2')
      expect(htmlToText('<div>block1</div><div>block2</div>')).toBe('block1\nblock2')
    })

    test('converts list items with dashes', () => {
      expect(htmlToText('<ul><li>item1</li><li>item2</li></ul>')).toBe('- item1\n- item2')
    })

    test('strips URLs from anchor tags keeping only link text', () => {
      expect(htmlToText('<a href="https://example.com">link</a>')).toBe('link')
      expect(htmlToText('<a href="https://example.com" class="test">link</a>')).toBe('link')
    })

    test('decodes HTML entities', () => {
      expect(htmlToText('&amp;')).toBe('&')
      expect(htmlToText('&lt;')).toBe('<')
      expect(htmlToText('&gt;')).toBe('>')
      expect(htmlToText('&quot;')).toBe('"')
      expect(htmlToText('a&nbsp;b')).toBe('a b')
      expect(htmlToText('a&amp;b')).toBe('a&b')
    })

    test('decodes numeric HTML entities', () => {
      expect(htmlToText('&#65;')).toBe('A')
      expect(htmlToText('&#x41;')).toBe('A')
    })

    test('truncates to max length with ellipsis', () => {
      const longText = 'a'.repeat(5000)
      const result = htmlToText(longText, 100)
      expect(result.length).toBe(100)
      expect(result.endsWith('...')).toBe(true)
      expect(result).toBe('a'.repeat(97) + '...')
    })

    test('does not truncate when under max length', () => {
      const shortText = 'short text'
      expect(htmlToText(shortText, 100)).toBe('short text')
    })

    test('trims whitespace', () => {
      expect(htmlToText('  trimmed  ')).toBe('trimmed')
      expect(htmlToText('\n\n\ntext\n\n')).toBe('text')
    })

    test('collapses multiple newlines to max two', () => {
      expect(htmlToText('line1\n\n\n\nline2')).toBe('line1\n\nline2')
      expect(htmlToText('line1\n\nline2')).toBe('line1\n\nline2')
    })

    test('handles complex HTML', () => {
      const html =
        '<p>Hello <strong>World</strong>!</p><p><a href="https://example.com">Link</a></p>'
      expect(htmlToText(html)).toBe('Hello World!\n\nLink')
    })
  })

  describe('buildEmbed', () => {
    const baseItem: NewsItem = {
      id: 'test-1',
      title: 'Test News Title',
      url: 'https://example.com/news/1',
      content: '<p>Test content here</p>',
      snippet: 'Test content here',
      publishedAt: new Date('2024-01-15T12:00:00Z'),
      source: 'test-source',
      image: 'https://example.com/image.jpg',
    }

    test('builds embed with correct structure', () => {
      const embed = buildEmbed(baseItem, {
        includeImages: true,
        sourceName: 'Counter-Strike 2',
        sourceType: 'steam_game',
      })

      expect(embed.title).toBe('Test News Title')
      expect(embed.url).toBe('https://example.com/news/1')
      expect(embed.color).toBe(0x1b2838)
      expect(embed.timestamp).toBe('2024-01-15T12:00:00.000Z')
      expect(embed.author?.name).toBe('Steam')
      expect(embed.author?.icon_url).toBe('https://store.steampowered.com/favicon.ico')
      expect(embed.footer?.text).toBe('Counter-Strike 2')
      expect(embed.image?.url).toBe('https://example.com/image.jpg')
      expect(embed.description).toBe('Test content here')
    })

    test('uses source-specific colors', () => {
      expect(buildEmbed(baseItem, { sourceType: 'steam_game' }).color).toBe(0x1b2838)
      expect(buildEmbed(baseItem, { sourceType: 'reddit' }).color).toBe(0xff4500)
      expect(buildEmbed(baseItem, { sourceType: 'rss' }).color).toBe(0x2196f3)
      expect(buildEmbed(baseItem, { sourceType: 'github' }).color).toBe(0x24292e)
    })

    test('omits footer when sourceName matches source label', () => {
      const embed = buildEmbed(baseItem, {
        sourceName: 'Steam',
        sourceType: 'steam_game',
      })

      expect(embed.footer).toBeUndefined()
    })

    test('uses large image instead of thumbnail', () => {
      const embed = buildEmbed(baseItem, { includeImages: true })

      expect(embed.image?.url).toBe('https://example.com/image.jpg')
      expect('thumbnail' in embed).toBe(false)
    })

    test('excludes image when includeImages is false', () => {
      const embed = buildEmbed(baseItem, { includeImages: false })

      expect(embed.image).toBeUndefined()
    })

    test('excludes image when item has no image', () => {
      const { image: _, ...noImageItem } = baseItem
      const embed = buildEmbed(noImageItem, { includeImages: true })

      expect(embed.image).toBeUndefined()
    })

    test('prefers snippet over content for description', () => {
      const item: NewsItem = {
        ...baseItem,
        snippet: 'Short snippet',
        content: '<p>Very long full content that should not be used</p>',
      }

      const embed = buildEmbed(item)
      expect(embed.description).toBe('Short snippet')
    })

    test('falls back to content when snippet is absent', () => {
      const { snippet: _, ...rest } = baseItem
      const item: NewsItem = {
        ...rest,
        content: '<p>Fallback content</p>',
      }

      const embed = buildEmbed(item)
      expect(embed.description).toBe('Fallback content')
    })

    test('truncates description to ~300 chars', () => {
      const item: NewsItem = {
        ...baseItem,
        snippet: 'a '.repeat(200),
      }

      const embed = buildEmbed(item)
      expect(embed.description!.length).toBeLessThanOrEqual(301)
    })

    test('excludes description when no content or snippet', () => {
      const { snippet: _s, content: _c, ...rest } = baseItem
      const item: NewsItem = rest

      const embed = buildEmbed(item)
      expect(embed.description).toBeUndefined()
    })

    test('truncates title to 256 characters', () => {
      const item: NewsItem = {
        ...baseItem,
        title: 'x'.repeat(300),
      }

      const embed = buildEmbed(item)
      expect(embed.title.length).toBe(256)
      expect(embed.title.endsWith('...')).toBe(true)
    })

    test('defaults to RSS blue for unknown source type', () => {
      const embed = buildEmbed(baseItem, { sourceType: 'unknown_type' })
      expect(embed.color).toBe(0x2196f3)
    })
  })

  describe('postEmbeds', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    test('sends embeds in a single webhook call', async () => {
      const embed = buildEmbed({
        id: 'test-1',
        title: 'Test',
        url: 'https://example.com',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test',
      })

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postEmbeds([embed], 'https://discord.com/api/webhooks/test')

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const call = fetchMock.mock.calls[0]!
      expect(call[0]).toBe('https://discord.com/api/webhooks/test')
      expect(call[1].method).toBe('POST')

      const body = JSON.parse(call[1].body)
      expect(body.embeds).toHaveLength(1)
      expect(body.embeds[0].title).toBe('Test')
    })

    test('sends multiple embeds in one call', async () => {
      const embeds = [1, 2, 3].map((i) =>
        buildEmbed({
          id: `test-${i}`,
          title: `Test ${i}`,
          url: `https://example.com/${i}`,
          publishedAt: new Date('2024-01-15T12:00:00Z'),
          source: 'test',
        }),
      )

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postEmbeds(embeds, 'https://discord.com/api/webhooks/test')

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.embeds).toHaveLength(3)
    })

    test('does nothing when embeds array is empty', async () => {
      await postEmbeds([], 'https://discord.com/api/webhooks/test')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('retries on failed request', async () => {
      const embed = buildEmbed({
        id: 'test-retry',
        title: 'Retry Test',
        url: 'https://example.com',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test',
      })

      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 204 })

      await postEmbeds([embed], 'https://discord.com/api/webhooks/test')

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('throws after max retries exhausted', async () => {
      const embed = buildEmbed({
        id: 'test-fail',
        title: 'Fail',
        url: 'https://example.com',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test',
      })

      fetchMock.mockRejectedValue(new Error('Connection refused'))

      await expect(
        postEmbeds([embed], 'https://discord.com/api/webhooks/test'),
      ).rejects.toThrow()

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })
})
