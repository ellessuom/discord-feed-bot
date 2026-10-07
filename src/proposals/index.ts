import { loadConfig, type ProposalsConfig } from '../config'
import { d1Query } from '../d1'
import { DiscordClient } from '../discord/client'
import { HttpError } from '../utils/http-error'
import { loadProposals, saveProposals } from './store'
import { scanChannel, storeUrl, type ScannedMessage } from './scan'
import { fetchAppDetails, fetchPrices, type SteamRegion, type SteamLookup } from './steam'
import {
  buildProposalEmbed,
  deriveTags,
  ensureTags,
  forumRequiresTag,
  formatPrice,
  nameFromUrlSlug,
  ownershipFields,
  pingTargets,
  priceFrom,
  type Ownership,
} from './forum'
import { proposalKey, type Proposal, type ProposalKey, type ProposalsFile } from './types'

const VOTE_EMOJI = ['👍', '👎', '🤷']
const CAPTURED_EMOJI = '✅'

interface Mode {
  dryRun: boolean
  backfill: boolean
  undo: boolean
  maxPages: number | undefined
}

function parseArgs(argv: string[]): Mode {
  const limitArg = argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined
  return {
    dryRun: argv.includes('--dry-run'),
    backfill: argv.includes('--backfill'),
    undo: argv.includes('--undo'),
    maxPages: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
  }
}

/** Steam gives us three distinct outcomes; collapsing them mislabels free games as delisted. */
function statusFromLookup(lookup: SteamLookup): Proposal['status'] {
  if (lookup.state === 'failed') return 'delisted'
  if (lookup.state === 'unavailable') return 'unresolved'
  const { details } = lookup
  if (details.price) return 'priced'
  if (details.isFree) return 'free'
  if (details.comingSoon) return 'unreleased'
  return 'unresolved'
}

async function resolveProposal(
  ref: ProposalKey,
  region: SteamRegion
): Promise<{ proposal: Omit<Proposal, 'mentions'>; tags: string[] }> {
  const url = storeUrl(ref.kind, ref.id)
  const slugName = nameFromUrlSlug(url)

  // v1 records packages and bundles but does not resolve them: they live in a
  // different id space and appdetails would report them as delisted apps.
  if (ref.kind !== 'app') {
    const base: Omit<Proposal, 'mentions'> = {
      kind: ref.kind,
      id: ref.id,
      name: slugName ?? `Steam ${ref.kind} ${ref.id}`,
      url,
      status: 'unresolved',
    }
    return { proposal: base, tags: [] }
  }

  const lookup = await fetchAppDetails(ref.id, region)
  const status = statusFromLookup(lookup)
  const details = lookup.state === 'ok' ? lookup.details : undefined

  const proposal: Omit<Proposal, 'mentions'> = {
    kind: ref.kind,
    id: ref.id,
    name: details?.name ?? slugName ?? `Steam app ${ref.id}`,
    url,
    status,
  }
  if (details?.headerImage) proposal.headerImage = details.headerImage
  if (details?.shortDescription) proposal.description = details.shortDescription
  if (details?.price) proposal.price = priceFrom(details.price)

  const tags = deriveTags({ ...proposal, mentions: [] }, details)
  return { proposal, tags }
}

async function editStarterMessage(
  client: DiscordClient,
  proposal: Proposal,
  embed: ReturnType<typeof buildProposalEmbed>
): Promise<void> {
  const threadId = proposal.threadId
  const messageId = proposal.starterMessageId ?? threadId
  if (!threadId || !messageId) return

  try {
    await client.editMessage(threadId, messageId, { embeds: [embed] })
  } catch (error) {
    // Archived threads reject edits; the bot owns the thread so it may unarchive.
    if (error instanceof HttpError && (error.status === 403 || error.status === 400)) {
      console.log(`  Thread ${threadId} appears archived; unarchiving to edit`)
      await client.setThreadArchived(threadId, false)
      await client.editMessage(threadId, messageId, { embeds: [embed] })
      return
    }
    throw error
  }
}

async function reactSafely(
  client: DiscordClient,
  channelId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  try {
    await client.addReaction(channelId, messageId, emoji)
  } catch (error) {
    // A deleted message or a locked channel shouldn't abort a backfill.
    console.warn(
      `  Could not add ${emoji} to ${messageId}: ${error instanceof Error ? error.message : error}`
    )
  }
}

async function processMessages(
  client: DiscordClient,
  store: ProposalsFile,
  scanned: ScannedMessage[],
  config: ProposalsConfig,
  tagIds: Map<string, string>,
  requiresTag: boolean
): Promise<{ created: number; updated: number }> {
  const region: SteamRegion = { cc: config.country_code, lang: config.language }
  let created = 0
  let updated = 0

  // Oldest-first so the forum reads chronologically.
  const ordered = [...scanned].sort((a, b) =>
    BigInt(a.message.id) < BigInt(b.message.id) ? -1 : 1
  )

  for (const { message, refs } of ordered) {
    for (const ref of refs) {
      const key = proposalKey(ref.kind, ref.id)
      const existing = store.proposals[key]

      if (existing) {
        if (!existing.mentions.some((m) => m.messageId === message.id)) {
          existing.mentions.push({
            userId: message.author.id,
            username: message.author.username,
            messageId: message.id,
            at: message.timestamp,
          })
          updated++
          saveProposals(store)
        }
        await reactSafely(client, config.general_channel_id, message.id, CAPTURED_EMOJI)
        continue
      }

      const { proposal, tags } = await resolveProposal(ref, region)
      const record: Proposal = {
        ...proposal,
        mentions: [
          {
            userId: message.author.id,
            username: message.author.username,
            messageId: message.id,
            at: message.timestamp,
          },
        ],
      }

      let appliedTags = tags.map((name) => tagIds.get(name)).filter((id): id is string => !!id)
      if (appliedTags.length === 0 && requiresTag) {
        // REQUIRE_TAG forums reject a post with no tags — fall back to a neutral one.
        const fallback = tagIds.get('shortlist') ?? [...tagIds.values()][0]
        if (fallback) appliedTags = [fallback]
      }

      console.log(`  + ${record.name} (${key}) [${tags.join(', ') || 'no tags'}]`)

      const thread = await client.createForumPost(config.forum_channel_id, {
        name: record.name,
        embeds: [buildProposalEmbed(record)],
        appliedTags,
      })

      record.threadId = thread.id
      record.starterMessageId = thread.message?.id ?? thread.id
      record.tags = tags
      store.proposals[key] = record
      created++
      saveProposals(store)

      for (const emoji of VOTE_EMOJI) {
        await reactSafely(client, thread.id, record.starterMessageId, emoji)
      }
      await reactSafely(client, config.general_channel_id, message.id, CAPTURED_EMOJI)
    }
  }

  return { created, updated }
}

async function refreshPrices(
  client: DiscordClient,
  store: ProposalsFile,
  config: ProposalsConfig,
  ownership: Ownership | undefined
): Promise<number> {
  const tracked = Object.values(store.proposals).filter(
    (p) => p.kind === 'app' && p.threadId && p.status !== 'delisted'
  )
  if (tracked.length === 0) return 0

  console.log(`Refreshing prices for ${tracked.length} game(s)...`)
  const prices = await fetchPrices(
    tracked.map((p) => p.id),
    { cc: config.country_code, lang: config.language }
  )

  let changed = 0

  for (const proposal of tracked) {
    const fresh = prices.get(proposal.id)
    if (!fresh) continue

    const previous = proposal.price
    if (
      previous &&
      previous.current === fresh.final &&
      previous.discount === fresh.discount_percent
    ) {
      continue
    }

    const dropped = previous !== undefined && fresh.final < previous.current
    proposal.price = priceFrom(fresh, previous?.lowestSeen)
    if (proposal.status === 'free' && fresh.final > 0) proposal.status = 'priced'
    changed++

    await editStarterMessage(client, proposal, buildProposalEmbed(proposal, undefined, ownership))

    if (dropped && previous) {
      const targets = pingTargets(proposal, ownership)
      const mentionList = targets.map((id) => `<@${id}> `).join('')
      const was = formatPrice(previous.current, previous.currency)
      const now = formatPrice(fresh.final, fresh.currency)
      const lowest = proposal.price.lowestSeen
      const isLow = lowest >= fresh.final
      const suffix = isLow ? ' — lowest price seen so far.' : ''
      await client.createMessage(proposal.threadId as string, {
        content: `${mentionList}**${proposal.name}** dropped: ~~${was}~~ → **${now}** (${fresh.discount_percent}% off)${suffix}`,
        allowed_mentions: { parse: [], users: targets },
      })
    }
    // Saved only after the ping: if it fails, the next run still sees the drop and retries.
    saveProposals(store)
  }

  return changed
}

/** Best-effort: without D1 (no token, outage, schema not applied yet) the forum works as before. */
async function loadOwnership(store: ProposalsFile): Promise<Ownership | undefined> {
  const appids = Object.values(store.proposals)
    .filter((p) => p.kind === 'app' && p.threadId)
    .map((p) => p.id)
  try {
    const [members, rows] = await Promise.all([
      d1Query<{ discord_id: string }>('SELECT discord_id FROM members ORDER BY linked_at'),
      d1Query<{ discord_id: string; appid: number; owns: number }>(
        `SELECT m.discord_id, o.appid, 1 AS owns FROM owned_games o
           JOIN members m ON m.steam_id = o.steam_id
           WHERE o.appid IN (SELECT value FROM json_each(?1))
         UNION ALL
         SELECT m.discord_id, w.appid, 0 FROM wishlist w
           JOIN members m ON m.steam_id = w.steam_id
           WHERE w.appid IN (SELECT value FROM json_each(?1))`,
        [JSON.stringify(appids)]
      ),
    ])
    if (!members || !rows) return undefined

    const ownership: Ownership = {
      members: members.map((m) => m.discord_id),
      owners: new Map(),
      wishlisters: new Map(),
    }
    for (const row of rows) {
      const byApp = row.owns ? ownership.owners : ownership.wishlisters
      const ids = byApp.get(row.appid) ?? new Set<string>()
      byApp.set(row.appid, ids.add(row.discord_id))
    }
    console.log(`Ownership: ${ownership.members.length} linked member(s).`)
    return ownership
  } catch (error) {
    console.warn(
      `Skipping ownership (D1 unavailable): ${error instanceof Error ? error.message : error}`
    )
    return undefined
  }
}

/**
 * Re-renders a card only when its "Owned by" fields change. The last render is
 * kept in D1, because data/proposals.json is public and must not reveal who owns what.
 */
async function refreshOwnership(
  client: DiscordClient,
  store: ProposalsFile,
  ownership: Ownership
): Promise<number> {
  const rows = await d1Query<{ appid: number; rendered: string }>(
    'SELECT appid, rendered FROM proposal_owners'
  )
  const previous = new Map((rows ?? []).map((r) => [r.appid, r.rendered]))
  const changed: { appid: number; rendered: string }[] = []

  for (const proposal of Object.values(store.proposals)) {
    if (proposal.kind !== 'app' || !proposal.threadId) continue
    const rendered = JSON.stringify(ownershipFields(proposal.id, ownership))
    if (previous.get(proposal.id) === rendered) continue
    try {
      await editStarterMessage(client, proposal, buildProposalEmbed(proposal, undefined, ownership))
      changed.push({ appid: proposal.id, rendered })
    } catch (error) {
      // One deleted thread shouldn't block every card after it; it's retried next run.
      console.warn(
        `  Could not update ${proposal.name}: ${error instanceof Error ? error.message : error}`
      )
    }
  }

  if (changed.length > 0) {
    await d1Query(
      `INSERT INTO proposal_owners (appid, rendered)
       SELECT json_extract(value, '$.appid'), json_extract(value, '$.rendered') FROM json_each(?1) WHERE true
       ON CONFLICT (appid) DO UPDATE SET rendered = excluded.rendered`,
      [JSON.stringify(changed)]
    )
  }
  return changed.length
}

async function undo(client: DiscordClient, store: ProposalsFile, dryRun: boolean): Promise<void> {
  const withThreads = Object.entries(store.proposals).filter(([, p]) => p.threadId)

  if (dryRun) {
    console.log(`Undo dry run: would delete ${withThreads.length} forum post(s):`)
    for (const [, proposal] of withThreads) console.log(`  - ${proposal.name}`)
    return
  }

  console.log(`Deleting ${withThreads.length} forum post(s) created by this bot...`)

  for (const [key, proposal] of withThreads) {
    // Only ever delete threads this bot recorded — never enumerate the forum.
    try {
      await client.deleteThread(proposal.threadId as string)
      console.log(`  - deleted ${proposal.name}`)
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        console.log(`  - ${proposal.name} already gone`)
      } else {
        throw error
      }
    }
    delete store.proposals[key]
    saveProposals(store)
  }

  store.cursors = { newestScannedId: null, oldestScannedId: null, backfillComplete: false }
  saveProposals(store)
  console.log('Undo complete. Cursors reset.')
}

async function main(): Promise<void> {
  const mode = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  const proposalsConfig = config.proposals

  if (!proposalsConfig?.enabled) {
    console.log('Proposals feature is disabled in config.yaml; nothing to do.')
    return
  }

  const client = new DiscordClient(proposalsConfig.bot_token)
  const store = loadProposals()

  if (mode.undo) {
    await undo(client, store, mode.dryRun)
    return
  }

  console.log(
    mode.dryRun
      ? 'Proposals: dry run (no writes)'
      : mode.backfill
        ? 'Proposals: backfill'
        : 'Proposals: incremental'
  )

  // Incremental mode with no cursor yet would have no `after` bound and no page
  // limit, i.e. an uncontrolled full-history backfill triggered by the hourly
  // cron. Bootstrap the cursor from the newest page instead and post nothing;
  // history is the backfill workflow's job.
  const bootstrapping = !mode.backfill && !store.cursors.newestScannedId

  const scanOptions = mode.backfill
    ? {
        ...(store.cursors.oldestScannedId ? { before: store.cursors.oldestScannedId } : {}),
        maxPages: mode.maxPages,
      }
    : {
        ...(store.cursors.newestScannedId ? { after: store.cursors.newestScannedId } : {}),
        maxPages: bootstrapping ? 1 : mode.maxPages,
      }

  const scan = await scanChannel(client, proposalsConfig.general_channel_id, scanOptions)

  const uniqueRefs = new Set(
    scan.messages.flatMap((m) => m.refs.map((r) => proposalKey(r.kind, r.id)))
  )
  console.log(
    `Scanned ${scan.messagesSeen} message(s) over ${scan.pagesFetched} page(s); ` +
      `${scan.messages.length} carried Steam links (${uniqueRefs.size} unique).`
  )

  if (scan.messagesSeen > 0 && scan.messages.length === 0) {
    console.warn(
      'No Steam links found in any scanned message. If #general definitely contains them, ' +
        'the Message Content intent is probably still off — every `content` field would be empty.'
    )
  }

  if (bootstrapping && !mode.dryRun) {
    store.cursors.newestScannedId = scan.newestId
    if (!store.cursors.oldestScannedId) store.cursors.oldestScannedId = scan.oldestId
    saveProposals(store)
    console.log(
      'First run: recorded the current position in the channel without posting anything. ' +
        'Run the backfill workflow to catalogue existing history; future runs post new links only.'
    )
    return
  }

  if (mode.dryRun) {
    for (const { message, refs } of scan.messages.slice(0, 40)) {
      const keys = refs.map((r) => proposalKey(r.kind, r.id)).join(', ')
      console.log(`  ${message.timestamp}  @${message.author.username}  ${keys}`)
    }
    if (scan.messages.length > 40) console.log(`  ... and ${scan.messages.length - 40} more`)
    console.log('Dry run complete. Nothing was written.')
    return
  }

  // Tags must exist before the first thread: REQUIRE_TAG forums reject untagged posts.
  const channel = await client.getChannel(proposalsConfig.forum_channel_id)
  const tagIds = await ensureTags(client, proposalsConfig.forum_channel_id)
  const requiresTag = forumRequiresTag(channel.flags)

  const { created, updated } = await processMessages(
    client,
    store,
    scan.messages,
    proposalsConfig,
    tagIds,
    requiresTag
  )

  if (mode.backfill) {
    if (scan.oldestId) store.cursors.oldestScannedId = scan.oldestId
    if (scan.reachedStart) store.cursors.backfillComplete = true
    // The first backfill also establishes the forward cursor.
    if (!store.cursors.newestScannedId && scan.newestId) {
      store.cursors.newestScannedId = scan.newestId
    }
  } else if (scan.newestId) {
    store.cursors.newestScannedId = scan.newestId
    if (!store.cursors.oldestScannedId) store.cursors.oldestScannedId = scan.oldestId
  }
  saveProposals(store)

  const ownership = mode.backfill ? undefined : await loadOwnership(store)
  const priceChanges = mode.backfill
    ? 0
    : await refreshPrices(client, store, proposalsConfig, ownership)
  saveProposals(store)

  let ownershipChanges = 0
  if (ownership) {
    try {
      ownershipChanges = await refreshOwnership(client, store, ownership)
    } catch (error) {
      console.warn(`Ownership refresh failed: ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(
    `Done. ${created} new post(s), ${updated} re-mention(s), ${priceChanges} price change(s), ` +
      `${ownershipChanges} ownership update(s).` +
      (mode.backfill && store.cursors.backfillComplete ? ' Backfill complete.' : '')
  )
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
