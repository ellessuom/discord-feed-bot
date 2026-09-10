import type { DiscordClient, DiscordMessage } from '../discord/client'
import type { ProposalKey, ProposalKind } from './types'

/**
 * Matches the store URL shapes people actually paste:
 *   store.steampowered.com/app/774291/Last_Man_Sitting/
 *   store.steampowered.com/app/774291
 *   store.steampowered.com/agecheck/app/774291/
 *   store.steampowered.com/sub/12345/  |  /bundle/99/
 * The trailing slug is decorative — the id is the identity.
 */
const STORE_URL_RE = /https?:\/\/store\.steampowered\.com\/(?:agecheck\/)?(app|sub|bundle)\/(\d+)/gi

/** s.team/a/<appid> shortlinks are 302 redirects into the store. */
const SHORTLINK_RE = /https?:\/\/s\.team\/a\/(\d+)/gi

export function extractSteamRefs(content: string): ProposalKey[] {
  const found = new Map<string, ProposalKey>()

  for (const match of content.matchAll(STORE_URL_RE)) {
    const kind = match[1]?.toLowerCase() as ProposalKind | undefined
    const rawId = match[2]
    if (!kind || !rawId) continue
    const id = Number(rawId)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    found.set(`${kind}:${id}`, { kind, id })
  }

  // s.team/a/<id> always denotes an app, so it needs no network round-trip.
  for (const match of content.matchAll(SHORTLINK_RE)) {
    const rawId = match[1]
    if (!rawId) continue
    const id = Number(rawId)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    found.set(`app:${id}`, { kind: 'app', id })
  }

  return [...found.values()]
}

export function storeUrl(kind: ProposalKind, id: number): string {
  return `https://store.steampowered.com/${kind}/${id}/`
}

export interface ScannedMessage {
  message: DiscordMessage
  refs: ProposalKey[]
}

export interface ScanResult {
  messages: ScannedMessage[]
  /** Newest message id seen this pass, or null if the channel had nothing new. */
  newestId: string | null
  /** Oldest message id reached, for resuming a backfill. */
  oldestId: string | null
  /** True when a backward walk ran out of history. */
  reachedStart: boolean
  pagesFetched: number
  messagesSeen: number
}

export interface ScanOptions {
  /** Walk backwards from here (exclusive). Backfill mode. */
  before?: string | undefined
  /** Only fetch messages newer than this. Incremental mode. */
  after?: string | undefined
  /** Stop after this many pages — used by --limit for a cautious first run. */
  maxPages?: number | undefined
}

/**
 * Discord returns messages newest-first, 100 max per page. Walking backwards
 * chains on `before`; catching up chains on `after`.
 */
export async function scanChannel(
  client: DiscordClient,
  channelId: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const collected: ScannedMessage[] = []
  let newestId: string | null = null
  let oldestId: string | null = null
  let reachedStart = false
  let pagesFetched = 0
  let messagesSeen = 0

  // Backward walks chain on `before`; catch-up walks chain on `after`.
  let backCursor = options.before
  let forwardCursor = options.after

  for (;;) {
    if (options.maxPages !== undefined && pagesFetched >= options.maxPages) break

    const page: DiscordMessage[] = forwardCursor
      ? await client.getMessages(channelId, { after: forwardCursor, limit: 100 })
      : await client.getMessages(channelId, {
          ...(backCursor !== undefined ? { before: backCursor } : {}),
          limit: 100,
        })

    pagesFetched++

    if (page.length === 0) {
      reachedStart = !options.after
      break
    }

    messagesSeen += page.length

    const first = page[0]
    const last = page[page.length - 1]
    if (first && (newestId === null || BigInt(first.id) > BigInt(newestId))) {
      newestId = first.id
    }
    if (last) {
      oldestId = last.id
    }

    for (const message of page) {
      if (message.author.bot) continue
      const refs = extractSteamRefs(message.content)
      if (refs.length > 0) {
        collected.push({ message, refs })
      }
    }

    if (page.length < 100) {
      // A short page means we've caught up (forward) or hit the channel start (backward).
      reachedStart = !options.after
      break
    }

    if (options.after) {
      // Chain forward on the newest id so a busy hour isn't truncated at 100.
      if (!newestId) break
      forwardCursor = newestId
    } else {
      backCursor = last?.id
      if (!backCursor) break
    }
  }

  return { messages: collected, newestId, oldestId, reachedStart, pagesFetched, messagesSeen }
}
