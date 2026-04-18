import type { NewsItem } from './types'
import type { Source } from './sources/types'
import { dispatchSource, getSourceName } from './sources'
import { loadConfig } from './config'
import { loadState, saveState, isNewItem, markPosted } from './state'
import { saveStatus, calculateNextRun, type StatusError } from './status'
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

  const allNewPosts = dedupeByItemId(results.flatMap((r) => r.items))
  const sourceErrors = results.map((r) => r.error).filter((e): e is StatusError => e !== null)

  const maxPosts = config.settings.max_posts_per_run
  const postOrder = config.settings.post_order
  const sortedForPosting = [...allNewPosts]
  if (postOrder === 'oldest_first') {
    sortedForPosting.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
  } else {
    sortedForPosting.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  }

  const postsToDiscord = sortedForPosting.slice(0, maxPosts)
  const overflowPosts = sortedForPosting.slice(maxPosts)

  if (sortedForPosting.length > maxPosts) {
    console.log(`Too many new posts (${sortedForPosting.length}). Limiting to ${maxPosts}`)
  }

  for (const item of overflowPosts) {
    markPosted(item.id, item.source, state)
    saveState(state)
  }

  console.log(`Posting ${postsToDiscord.length} new post(s) to Discord...`)
  const postingErrors: StatusError[] = []
  let postsDelivered = 0
  for (const item of postsToDiscord) {
    const source = enabledSources.find((s) => s.id === item.source)
    const sourceName = source ? getSourceName(source) : 'Unknown'

    try {
      await postNews(item, config.discord.webhook_url, {
        includeImages: config.settings.include_images,
        sourceName,
      })
      markPosted(item.id, item.source, state)
      saveState(state)
      postsDelivered++
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`    Post error: ${errorMsg}`)
      postingErrors.push({
        source: item.source,
        message: errorMsg,
        time: new Date().toISOString(),
      })
    }
  }

  const errors = [...sourceErrors, ...postingErrors]

  const now = new Date().toISOString()
  const success = errors.length === 0
  const allErrors = errors

  saveStatus({
    lastRun: now,
    success,
    postsCount: postsDelivered,
    sourcesCount: enabledSources.length,
    errors: allErrors,
    nextRun: calculateNextRun(now),
  })

  if (success) {
    console.log(`Done! Posted ${postsDelivered} new post(s).`)
  } else {
    console.log(
      `Done! Posted ${postsDelivered} new post(s). ${errors.length} error(s) this run.`
    )
  }
}

function dedupeByItemId(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
