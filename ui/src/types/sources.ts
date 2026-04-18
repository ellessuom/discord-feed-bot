export type SourceType = 'steam_game' | 'steam_news' | 'steam_sales' | 'reddit' | 'rss' | 'github'

export interface BaseSource {
  id: string
  type: SourceType
  name: string
  enabled?: boolean
}

export interface SteamGameSource extends BaseSource {
  type: 'steam_game'
  appid: number
}

export interface SteamNewsSource extends BaseSource {
  type: 'steam_news'
}

export interface SteamSalesSource extends BaseSource {
  type: 'steam_sales'
}

export interface RedditSource extends BaseSource {
  type: 'reddit'
  subreddit: string
}

export interface RSSSource extends BaseSource {
  type: 'rss'
  url: string
}

export interface GitHubSource extends BaseSource {
  type: 'github'
  owner: string
  repo: string
}

export type Source =
  | SteamGameSource
  | SteamNewsSource
  | SteamSalesSource
  | RedditSource
  | RSSSource
  | GitHubSource

export interface Settings {
  max_posts_per_run: number
  max_items_per_source: number
  include_images: boolean
  post_order: 'newest_first' | 'oldest_first'
}

export interface Config {
  discord: {
    webhook_url: string
  }
  sources: Source[]
  settings: Settings
}

export const SOURCE_TYPE_INFO: Record<
  SourceType,
  { icon: string; label: string; description: string }
> = {
  steam_game: {
    icon: 'Gamepad2',
    label: 'Steam Game',
    description: 'Track a specific Steam game news',
  },
  steam_news: {
    icon: 'Newspaper',
    label: 'Steam News',
    description: 'Platform-wide announcements',
  },
  steam_sales: {
    icon: 'Percent',
    label: 'Steam Sales',
    description: 'Current deals & promotions',
  },
  reddit: {
    icon: 'MessageCircle',
    label: 'Reddit',
    description: 'Subreddit feed',
  },
  rss: {
    icon: 'Rss',
    label: 'RSS',
    description: 'Any RSS/Atom feed',
  },
  github: {
    icon: 'Github',
    label: 'GitHub',
    description: 'Repository releases',
  },
}
