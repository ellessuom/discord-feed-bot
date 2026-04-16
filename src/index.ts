import { NewsItem } from './types'
import { dispatchSource, getSourceName } from './sources'
import { loadConfig } from './config'
import { loadState, saveState, isNewItem, markPosted } from './state'
import { postNews } from './discord/webhook'

async function main(): Promise<void> {
  console.log('Discord Feed Bot')
  console.log('Starting feed fetch...')

  const config = loadConfig()
  const state = loadState()

  const newPosts: NewsItem[] = []
  const enabledSources = config.sources.filter((s) => s.enabled !== false)

  console.log(`Fetching news for ${enabledSources.length} source(s)...`)

  for (const source of enabledSources) {
    console.log(`  Fetching: ${source.name}...`)
    const items = await dispatchSource(source)
    const newItems = items.filter((n) => isNewItem(n.id, source.id, state))
    newPosts.push(...newItems)
    console.log(`    ${items.length} items found, ${newItems.length} new`)
  }

  const maxPosts = config.settings.max_posts_per_run
  if (newPosts.length > maxPosts) {
    console.log(`Too many new posts (${newPosts.length}). Limiting to ${maxPosts}`)
    newPosts.length = maxPosts
  }

  const postOrder = config.settings.post_order
  if (postOrder === 'oldest_first') {
    newPosts.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
  } else {
    newPosts.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  }

  console.log(`Posting ${newPosts.length} new post(s) to Discord...`)
  for (const item of newPosts) {
    const source = enabledSources.find((s) => s.id === item.source)
    const sourceName = source ? getSourceName(source) : 'Unknown'

    await postNews(item, config.discord.webhook_url, {
      includeImages: config.settings.include_images,
      sourceName,
    })

    markPosted(item.id, item.source, state)
  }

  saveState(state)

  console.log(`Done! Posted ${newPosts.length} new post(s).`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
