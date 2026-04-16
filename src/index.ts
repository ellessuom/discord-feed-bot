import { fetchSteamNews, fetchGameNews } from './sources/steam.js'
import { loadConfig } from './config.js'
import { loadState, saveState, isNewItem, markPosted } from './state.js'
import { postNews } from './discord/webhook.js'
import { NewsItem } from './types.js'

async function main(): Promise<void> {
  console.log('Discord Steam Feed Bot')
  console.log('Starting feed fetch...')

  const config = loadConfig()
  const state = loadState()

  const newPosts: NewsItem[] = []

  // Fetch game news
  console.log(`Fetching news for ${config.sources.games.length} game(s)...`)
  for (const game of config.sources.games) {
    const news = await fetchGameNews(game.appid, game.name)
    const newNews = news.filter((n) => isNewItem(n, state))
    newPosts.push(...newNews)
    console.log(`  ${game.name}: ${news.length} items found, ${newNews.length} new`)
  }

  // Fetch Steam news if enabled
  if (config.sources.steam_news.enabled) {
    console.log('Fetching general Steam news...')
    const news = await fetchSteamNews()
    const newNews = news.filter((n) => isNewItem(n, state))
    newPosts.push(...newNews)
    console.log(`  Steam News: ${news.length} items found, ${newNews.length} new`)
  }

  // Limit posts per run
  const maxPosts = config.settings.max_posts_per_run
  if (newPosts.length > maxPosts) {
    console.log(`Too many new posts (${newPosts.length}). Limiting to ${maxPosts}`)
    newPosts.length = maxPosts
  }

  // Sort posts (newest first by default)
  if (config.settings.post_order === 'oldest_first') {
    newPosts.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
  } else {
    newPosts.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  }

  // Post to Discord
  console.log(`Posting ${newPosts.length} new post(s) to Discord...`)
  for (const item of newPosts) {
    const sourceName =
      item.source === 'steam_news'
        ? 'Steam News'
        : config.sources.games.find((g) => `game_${g.appid}` === item.source)?.name || 'Steam'

    await postNews(item, config.discord.webhook_url, {
      includeImages: config.settings.include_images,
      sourceName,
    })

    markPosted(item, state)
  }

  // Save state
  saveState(state)

  console.log(`Done! Posted ${newPosts.length} new post(s).`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
