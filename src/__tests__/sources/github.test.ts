import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchGitHub } from '../../sources/github'
import type { GitHubSource } from '../../sources/types'

function mockRelease(
  id: number,
  overrides?: Partial<{
    name: string | null
    body: string | null
    author: { login: string; avatar_url: string } | null
  }>
) {
  return {
    id,
    tag_name: `v${id}.0.0`,
    name: overrides?.name !== undefined ? overrides.name : `Release ${id}`,
    body: overrides?.body !== undefined ? overrides.body : 'Release body text',
    html_url: `https://github.com/facebook/react/releases/tag/v${id}`,
    published_at: '2024-06-01T12:00:00Z',
    author: overrides?.author !== undefined ? overrides.author : { login: 'user', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    assets: [] as Array<{ name: string; browser_download_url: string }>,
  }
}

function okResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

describe('GitHub releases source handler', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('fetches releases and maps to news items', async () => {
    const source: GitHubSource = {
      id: 'react-releases',
      type: 'github',
      name: 'React',
      owner: 'facebook',
      repo: 'react',
    }

    fetchMock.mockImplementation(() => okResponse([mockRelease(1)]))

    const items = await fetchGitHub(source)

    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBe(1)
    expect(items[0]!.source).toBe('react-releases')
    expect(items[0]!.url).toContain('github.com')
  })

  test('items have required fields with correct types', async () => {
    const source: GitHubSource = {
      id: 'react-types',
      type: 'github',
      name: 'React',
      owner: 'facebook',
      repo: 'react',
    }

    fetchMock.mockImplementation(() => okResponse([mockRelease(1)]))

    const items = await fetchGitHub(source)

    for (const item of items) {
      expect(typeof item.id).toBe('string')
      expect(typeof item.title).toBe('string')
      expect(typeof item.url).toBe('string')
      expect(item.publishedAt instanceof Date).toBe(true)
      expect(typeof item.source).toBe('string')
    }
  })

  test('title format includes source name prefix', async () => {
    const source: GitHubSource = {
      id: 'react-title',
      type: 'github',
      name: 'React',
      owner: 'facebook',
      repo: 'react',
    }

    fetchMock.mockImplementation(() => okResponse([mockRelease(1)]))

    const items = await fetchGitHub(source)

    for (const item of items) {
      expect(item.title).toMatch(/^React: /)
    }
  })

  test('includes optional content field from release body', async () => {
    const source: GitHubSource = {
      id: 'react-content',
      type: 'github',
      name: 'React',
      owner: 'facebook',
      repo: 'react',
    }

    fetchMock.mockImplementation(() => okResponse([mockRelease(1, { body: 'Hello body' })]))

    const items = await fetchGitHub(source)
    const itemsWithContent = items.filter((i) => i.content)

    expect(itemsWithContent.length).toBeGreaterThan(0)

    for (const item of itemsWithContent) {
      expect(typeof item.content).toBe('string')
      expect(item.content!.length).toBeLessThanOrEqual(2000)
    }
  })

  test('includes image field from author avatar', async () => {
    const source: GitHubSource = {
      id: 'react-image',
      type: 'github',
      name: 'React',
      owner: 'facebook',
      repo: 'react',
    }

    fetchMock.mockImplementation(() =>
      okResponse([
        mockRelease(1, {
          author: { login: 'u', avatar_url: 'https://avatars.githubusercontent.com/u/99?v=4' },
        }),
      ])
    )

    const items = await fetchGitHub(source)
    const itemsWithImage = items.filter((i) => i.image)

    expect(itemsWithImage.length).toBeGreaterThan(0)

    for (const item of itemsWithImage) {
      expect(typeof item.image).toBe('string')
      expect(item.image).toMatch(/^https?:\/\//)
    }
  })

  test('releases are limited to 10 items max', async () => {
    const source: GitHubSource = {
      id: 'react-limit',
      type: 'github',
      name: 'React',
      owner: 'facebook',
      repo: 'react',
    }

    const many = Array.from({ length: 12 }, (_, i) => mockRelease(i + 1))
    fetchMock.mockImplementation(() => okResponse(many))

    const items = await fetchGitHub(source)

    expect(items.length).toBeLessThanOrEqual(10)
  })

  test('throws for non-existent repo (404)', async () => {
    const source: GitHubSource = {
      id: 'nonexistent',
      type: 'github',
      name: 'NonExistent',
      owner: 'nonexistent-user-xyz-12345',
      repo: 'nonexistent-repo-xyz-12345',
    }

    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ message: 'Not Found' }),
    })

    await expect(fetchGitHub(source)).rejects.toThrow(/GitHub repo not found/)
  })

  test('propagates network errors', async () => {
    const source: GitHubSource = {
      id: 'error-test',
      type: 'github',
      name: 'Test',
      owner: 'facebook',
      repo: 'react',
    }

    fetchMock.mockRejectedValue(new Error('network down'))

    await expect(fetchGitHub(source)).rejects.toThrow(/Failed after 3 attempts/)
  })
})
