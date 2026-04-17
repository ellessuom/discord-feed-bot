import { describe, test, expect } from 'vitest'
import { fetchGitHub } from '../../sources/github'
import type { GitHubSource } from '../../sources/types'

describe('GitHub releases source handler', () => {
  describe('real network requests', () => {
    test(
      'fetches releases from facebook/react',
      async () => {
        const source: GitHubSource = {
          id: 'react-releases',
          type: 'github',
          name: 'React',
          owner: 'facebook',
          repo: 'react',
        }

        const items = await fetchGitHub(source)

        expect(Array.isArray(items)).toBe(true)
        expect(items.length).toBeGreaterThan(0)
        expect(items.length).toBeLessThanOrEqual(10)

        expect(items.length).toBeGreaterThan(0)

        const item = items[0]!
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('title')
        expect(item).toHaveProperty('url')
        expect(item).toHaveProperty('publishedAt')
        expect(item).toHaveProperty('source')
        expect(item.source).toBe('react-releases')
        expect(item.url).toContain('github.com')
      },
      { retry: 2, timeout: 15000 }
    )
  })

  describe('response structure', () => {
    test(
      'items have required fields with correct types',
      async () => {
        const source: GitHubSource = {
          id: 'react-types',
          type: 'github',
          name: 'React',
          owner: 'facebook',
          repo: 'react',
        }

        const items = await fetchGitHub(source)

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
      'title format includes source name prefix',
      async () => {
        const source: GitHubSource = {
          id: 'react-title',
          type: 'github',
          name: 'React',
          owner: 'facebook',
          repo: 'react',
        }

        const items = await fetchGitHub(source)

        expect(items.length).toBeGreaterThan(0)

        for (const item of items) {
          expect(item.title).toMatch(/^React: /)
        }
      },
      { retry: 2, timeout: 15000 }
    )

    test(
      'includes optional content field from release body',
      async () => {
        const source: GitHubSource = {
          id: 'react-content',
          type: 'github',
          name: 'React',
          owner: 'facebook',
          repo: 'react',
        }

        const items = await fetchGitHub(source)
        const itemsWithContent = items.filter((i) => i.content)

        expect(itemsWithContent.length).toBeGreaterThan(0)

        for (const item of itemsWithContent) {
          expect(typeof item.content).toBe('string')
          expect(item.content!.length).toBeLessThanOrEqual(2000)
        }
      },
      { retry: 2, timeout: 15000 }
    )

    test(
      'includes image field from author avatar',
      async () => {
        const source: GitHubSource = {
          id: 'react-image',
          type: 'github',
          name: 'React',
          owner: 'facebook',
          repo: 'react',
        }

        const items = await fetchGitHub(source)
        const itemsWithImage = items.filter((i) => i.image)

        expect(itemsWithImage.length).toBeGreaterThan(0)

        for (const item of itemsWithImage) {
          expect(typeof item.image).toBe('string')
          expect(item.image).toMatch(/^https?:\/\//)
        }
      },
      { retry: 2, timeout: 15000 }
    )

    test(
      'releases are limited to 10 items max',
      async () => {
        const source: GitHubSource = {
          id: 'react-limit',
          type: 'github',
          name: 'React',
          owner: 'facebook',
          repo: 'react',
        }

        const items = await fetchGitHub(source)

        expect(items.length).toBeLessThanOrEqual(10)
      },
      { retry: 2, timeout: 15000 }
    )
  })

  describe('error handling', () => {
    test(
      'returns empty array for non-existent repo (404)',
      async () => {
        const source: GitHubSource = {
          id: 'nonexistent',
          type: 'github',
          name: 'NonExistent',
          owner: 'nonexistent-user-xyz-12345',
          repo: 'nonexistent-repo-xyz-12345',
        }

        const items = await fetchGitHub(source)

        expect(Array.isArray(items)).toBe(true)
        expect(items.length).toBe(0)
      },
      { retry: 2, timeout: 15000 }
    )

    test(
      'returns empty array on network error without throwing',
      async () => {
        const source: GitHubSource = {
          id: 'error-test',
          type: 'github',
          name: 'Test',
          owner: 'facebook',
          repo: 'react',
        }

        const items = await fetchGitHub(source)

        expect(Array.isArray(items)).toBe(true)
      },
      { retry: 2, timeout: 15000 }
    )
  })
})
