import type { NewsItem } from './types'
import type { Source } from './sources/types'
import { dispatchSource, getSourceName } from './sources'
import { loadConfig } from './config'
import { loadState, saveState, isNewItem, markPosted } from './state'
import { loadStatus, saveStatus, calculateNextRun, type StatusError } from './status'
import { postNews } from './discord/webhook'

interface SourceResult {
  source: Source
  items: NewsItem[]
  error: StatusError | null
}

async function main(): Promise<void> {
  console.log('Discord Feed Bot')
  console.log('Starting feed fetch...')

  const config = loadConfig()
  const state = loadState()
  const previousStatus = loadStatus()

  const results: SourceResult[] = []
  const enabledSources = config.sources.filter((s) => s.enabled !== false)

  console.log(`Fetching news for ${enabledSources.length} source(s)...`)

  for (const source of enabledSources) {
    console.log(`  Fetching: ${source.name}...`)
    try {
      const items = await dispatchSource(source)
      const newItems = items.filter((n) => isNewItem(n.id, source.id, state))
      results.push({ source, items: newItems, error: null })
      console.log(`    ${items.length} items found, ${newItems.length} new`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`    Error: ${errorMsg}`)
      results.push({
        source,
        items: [],
        error: { source: source.id, message: errorMsg, time: new Date().toISOString() },
      })
    }
  }

  const newPosts = results.flatMap((r) => r.items)
  const errors = results.map((r) => r.error).filter((e): e is StatusError => e !== null)

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

  const now = new Date().toISOString()
  const success = errors.length === 0
  const allErrors = [...previousStatus.errors, ...errors]

  saveStatus({
    lastRun: now,
    success,
    postsCount: newPosts.length,
    sourcesCount: enabledSources.length,
    errors: allErrors,
    nextRun: calculateNextRun(now),
  })

  if (success) {
    console.log(`Done! Posted ${newPosts.length} new post(s).`)
  } else {
    console.log(
      `Done! Posted ${newPosts.length} new post(s). ${errors.length} source(s) had errors.`
    )
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
