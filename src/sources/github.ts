import { NewsItem } from '../types'
import { GitHubSource } from './types'
import { withRetry } from '../utils/retry'

interface GitHubRelease {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string | null
  author: {
    login: string
    avatar_url: string
  }
  assets: Array<{
    name: string
    browser_download_url: string
  }>
}

export async function fetchGitHub(source: GitHubSource): Promise<NewsItem[]> {
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/releases`

  const data = await withRetry(
    async () => {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Discord-Feed-Bot',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`GitHub repo not found: ${source.owner}/${source.repo}`)
        } else if (response.status === 403) {
          throw new Error(`GitHub API rate limit exceeded`)
        } else {
          throw new Error(`GitHub API error: ${response.status}`)
        }
      }

      return response.json()
    },
    { retries: 2, baseDelayMs: 1000 },
    { operation: `fetchGitHub(${source.owner}/${source.repo})` }
  )

  const releases: GitHubRelease[] = Array.isArray(data) ? data : []

  if (releases.length === 0) {
    return []
  }

  return releases.slice(0, 10).map((release): NewsItem => {
    const title = release.name || release.tag_name

    const newsItem: NewsItem = {
      id: String(release.id),
      title: `${source.name}: ${title}`,
      url: release.html_url,
      publishedAt: release.published_at ? new Date(release.published_at) : new Date(),
      source: source.id,
    }

    if (release.body) {
      newsItem.snippet = release.body.slice(0, 300)
      newsItem.content = release.body.slice(0, 2000)
    }

    if (release.author?.avatar_url) {
      newsItem.image = release.author.avatar_url
    }

    return newsItem
  })
}
