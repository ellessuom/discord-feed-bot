import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { postNews } from '../../discord/webhook'
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

    test('converts anchor tags to text with URL', () => {
      expect(htmlToText('<a href="https://example.com">link</a>')).toBe(
        'link (https://example.com)'
      )
      expect(htmlToText('<a href="https://example.com" class="test">link</a>')).toBe(
        'link (https://example.com)'
      )
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
      expect(htmlToText(html)).toBe('Hello World!\n\nLink (https://example.com)')
    })
  })

  describe('postNews', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    test('posts news with correct embed structure', async () => {
      const item: NewsItem = {
        id: 'test-1',
        title: 'Test News Title',
        url: 'https://example.com/news/1',
        content: '<p>Test content</p>',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
        image: 'https://example.com/image.jpg',
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
      })

      await postNews(item, 'https://discord.com/api/webhooks/test', {
        includeImages: true,
        sourceName: 'Test Source',
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const call = fetchMock.mock.calls[0]
      expect(call).toBeDefined()
      expect(call![0]).toBe('https://discord.com/api/webhooks/test')
      expect(call![1].method).toBe('POST')
      expect(call![1].headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(call![1].body)
      expect(body.embeds).toHaveLength(1)

      const embed = body.embeds[0]
      expect(embed.title).toBe('Test News Title')
      expect(embed.url).toBe('https://example.com/news/1')
      expect(embed.color).toBe(5814783)
      expect(embed.timestamp).toBe('2024-01-15T12:00:00.000Z')
      expect(embed.author.name).toBe('Test Source')
      expect(embed.author.url).toBeUndefined()
      expect(embed.footer.text).toBe('Test Source')
      expect(embed.thumbnail.url).toBe('https://example.com/image.jpg')
      expect(embed.description).toBe('Test content')
    })

    test('includes thumbnail when image present and includeImages is true', async () => {
      const item: NewsItem = {
        id: 'test-2',
        title: 'News with Image',
        url: 'https://example.com/news/2',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
        image: 'https://example.com/image.png',
      }

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test', {
        includeImages: true,
      })

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.embeds[0].thumbnail).toBeDefined()
      expect(body.embeds[0].thumbnail.url).toBe('https://example.com/image.png')
    })

    test('excludes thumbnail when includeImages is false', async () => {
      const item: NewsItem = {
        id: 'test-3',
        title: 'News without Image',
        url: 'https://example.com/news/3',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
        image: 'https://example.com/image.png',
      }

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test', {
        includeImages: false,
      })

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.embeds[0].thumbnail).toBeUndefined()
    })

    test('excludes thumbnail when no image on item', async () => {
      const item: NewsItem = {
        id: 'test-4',
        title: 'News no Image',
        url: 'https://example.com/news/4',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test')

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.embeds[0].thumbnail).toBeUndefined()
    })

    test('truncates embed title to 256 characters', async () => {
      const longTitle = 'x'.repeat(300)
      const item: NewsItem = {
        id: 'test-title-len',
        title: longTitle,
        url: 'https://example.com/news/long-title',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test', {
        sourceName: 'Source',
      })

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      const title = body.embeds[0].title as string
      expect(title.length).toBe(256)
      expect(title.endsWith('...')).toBe(true)
    })

    test('uses default sourceName when not provided', async () => {
      const item: NewsItem = {
        id: 'test-5',
        title: 'Test',
        url: 'https://example.com/news/5',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test')

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.embeds[0].author.name).toBe('Steam News')
      expect(body.embeds[0].footer.text).toBe('Steam News')
    })

    test('excludes description when content is undefined', async () => {
      const item: NewsItem = {
        id: 'test-6',
        title: 'No Content',
        url: 'https://example.com/news/6',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test')

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.embeds[0].description).toBeUndefined()
    })

    test('truncates description to DISCORD_MAX_DESCRIPTION', async () => {
      const longContent = 'a'.repeat(5000)
      const item: NewsItem = {
        id: 'test-7',
        title: 'Long Content',
        url: 'https://example.com/news/7',
        content: longContent,
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test')

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.embeds[0].description.length).toBeLessThanOrEqual(4096)
    })

    test('retries on failed request', async () => {
      const item: NewsItem = {
        id: 'test-8',
        title: 'Retry Test',
        url: 'https://example.com/news/8',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test')

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('retries on HTTP error status', async () => {
      const item: NewsItem = {
        id: 'test-9',
        title: 'HTTP Error Test',
        url: 'https://example.com/news/9',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
        .mockResolvedValueOnce({ ok: true, status: 204 })

      await postNews(item, 'https://discord.com/api/webhooks/test')

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('throws after max retries exhausted', async () => {
      const item: NewsItem = {
        id: 'test-10',
        title: 'Failed Request',
        url: 'https://example.com/news/10',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock.mockRejectedValue(new Error('Connection refused'))

      await expect(postNews(item, 'https://discord.com/api/webhooks/test')).rejects.toThrow()

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    test('throws after all retry attempts fail with HTTP error', async () => {
      const item: NewsItem = {
        id: 'test-11',
        title: 'Failed HTTP',
        url: 'https://example.com/news/11',
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        source: 'test-source',
      }

      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      await expect(postNews(item, 'https://discord.com/api/webhooks/test')).rejects.toThrow(
        'Failed after 3 attempts'
      )

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })
})
