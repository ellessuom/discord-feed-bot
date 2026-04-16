export type SourceType = 'steam_game' | 'steam_news' | 'steam_sales' | 'reddit' | 'rss' | 'github'

export interface BaseSource {
  id: string
  type: SourceType
  name: string
  enabled?: boolean | undefined
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
