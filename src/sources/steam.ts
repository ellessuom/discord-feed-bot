import { NewsItem } from '../types'
import Parser from 'rss-parser'

const parser = new Parser()

const STEAM_NEWS_URL = 'https://store.steampowered.com/feeds/news/'
const STEAM_APP_NEWS_URL = 'https://store.steampowered.com/feeds/news/app/'

export async function fetchSteamNews(): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(STEAM_NEWS_URL)
    return (
      feed.items?.map((item) => ({
        id: item.guid || item.id || item.link || '',
        title: item.title || '',
        url: item.link || '',
        content: item.content || item['content:encoded'] || '',
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        source: 'steam_news',
        image: item.enclosures?.[0]?.url,
      })) || []
    )
  } catch (error) {
    console.error('Error fetching Steam news:', error)
    return []
  }
}

export async function fetchGameNews(appid: number, name: string): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(`${STEAM_APP_NEWS_URL}${appid}/`)
    return (
      feed.items?.map((item) => ({
        id: item.guid || item.id || item.link || '',
        title: item.title || '',
        url: item.link || '',
        content: item.content || item['content:encoded'] || '',
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        source: `game_${appid}`,
        image: item.enclosures?.[0]?.url,
      })) || []
    )
  } catch (error) {
    console.error(`Error fetching news for game ${name} (appid: ${appid}):`, error)
    return []
  }
}
