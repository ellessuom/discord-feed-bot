import type { NewsItem } from './types'
import type { Source } from './sources/types'
import { dispatchSource, getSourceName } from './sources'
import { loadConfig } from './config'
import { loadState, saveState, isNewItem, markPosted } from './state'
import { saveStatus, calculateNextRun, type StatusError } from './status'
import { buildEmbed, postEmbeds, type BuildEmbedOptions } from './discord/webhook'

const EMBEDS_PER_MESSAGE = 10

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
  const maxItemsPerSource = config.settings.max_items_per_source

  console.log(`Fetching news for ${enabledSources.length} source(s)...`)

  for (const source of enabledSources) {
    console.log(`  Fetching: ${source.name}...`)
    try {
      const items = await dispatchSource(source)
      let newItems = items.filter((n) => isNewItem(n.id, source.id, state))

      if (newItems.length > maxItemsPerSource) {
        console.log(
          `    Capping ${source.name} from ${newItems.length} to ${maxItemsPerSource} items`,
        )
        newItems = newItems.slice(0, maxItemsPerSource)
      }

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

  const sourceMap = new Map(enabledSources.map((s) => [s.id, s]))
  const embeds = postsToDiscord.map((item) => {
    const source = sourceMap.get(item.source)
    const opts: BuildEmbedOptions = {
      includeImages: config.settings.include_images,
      sourceName: source ? getSourceName(source) : 'Unknown',
    }
    if (source) {
      opts.sourceType = source.type
    }
    return { embed: buildEmbed(item, opts), item }
  })

  console.log(`Posting ${embeds.length} new post(s) to Discord...`)
  const postingErrors: StatusError[] = []
  let postsDelivered = 0

  for (let i = 0; i < embeds.length; i += EMBEDS_PER_MESSAGE) {
    const batch = embeds.slice(i, i + EMBEDS_PER_MESSAGE)

    try {
      await postEmbeds(
        batch.map((b) => b.embed),
        config.discord.webhook_url,
      )
      for (const { item } of batch) {
        markPosted(item.id, item.source, state)
        postsDelivered++
      }
      saveState(state)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`    Batch post error: ${errorMsg}`)
      for (const { item } of batch) {
        postingErrors.push({
          source: item.source,
          message: errorMsg,
          time: new Date().toISOString(),
        })
      }
    }
  }

  const errors = [...sourceErrors, ...postingErrors]

  const now = new Date().toISOString()
  const success = errors.length === 0

  saveStatus({
    lastRun: now,
    success,
    postsCount: postsDelivered,
    sourcesCount: enabledSources.length,
    errors,
    nextRun: calculateNextRun(now),
  })

  if (success) {
    console.log(`Done! Posted ${postsDelivered} new post(s).`)
  } else {
    console.log(
      `Done! Posted ${postsDelivered} new post(s). ${errors.length} error(s) this run.`,
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
