/**
 * Hourly #game-news alerts: sales on co-op games the group plays or wishlists,
 * Early Access exits and releases. All state lives in D1, so this never commits.
 * It fails loudly (exit 1) on any D1 or Discord error, so GitHub emails the owner.
 */
import { respond, sanitize, settle, underMonthCap, type Sql } from '../ai'
import { d1Batch, d1Query, ensureSchema } from '../d1'
import { DiscordClient } from '../discord/client'
import { fetchAppDetails, fetchPrices, type SteamPrice } from '../proposals/steam'
import {
  PATCH_INSTRUCTIONS,
  fetchPatchNews,
  isSkip,
  newsText,
  newsUrl,
  patchCandidates,
  pickPatches,
  type PatchNews,
} from './patches'
import { fetchPicks } from './picks'
import {
  ALERTS_CHANNEL_ID,
  DAILY_CAP,
  buildAlertEmbed,
  buildPatchEmbed,
  buildLibrary,
  evaluateSale,
  isNew,
  metaFrom,
  metaQueue,
  priceCandidates,
  rank,
  transitions,
  type Alert,
  type AppMeta,
  type PriceHistory,
} from './rules'
import * as sql from './sql'

const REGION = { cc: 'IE', lang: 'english' }
/** "Daily", with slack for a run that starts a little early. */
const PICKS_EVERY_MS = 20 * 3_600_000
type OwnedRow = {
  discord_id: string
  appid: number
  playtime_forever: number
  playtime_2weeks: number
}
type Query = <T>(text: string, params?: string[]) => Promise<T[]>

/** The meter needs real D1: a missing token must fail closed, never read as "nothing spent". */
const meter: Sql = async (text, params) => {
  const rows = await d1Query<Record<string, unknown>>(text, params)
  if (!rows) throw new Error('D1 unavailable')
  return rows
}

interface Patches {
  alerts: Alert[]
  skipped: Alert[]
  failed: boolean
}

/**
 * Patch notes for games the group played ≥2 h in the last 2 weeks (see pickPatches for
 * which get summarized). Returns alerts to rank and SKIPs (not a patch) to record. An
 * OpenAI failure stops summarizing but keeps what was already paid for.
 */
async function patchAlerts(
  owned: OwnedRow[],
  meta: Map<number, AppMeta>,
  room: number,
  now: number,
  query: Query
): Promise<Patches> {
  const apiKey = process.env.OPENAI_API_KEY
  const result: Patches = { alerts: [], skipped: [], failed: false }
  if (process.env.AI_ENABLED !== 'true' || !apiKey) return result

  const candidates = [...patchCandidates(owned)].filter(([appid]) => meta.get(appid)?.name)
  const news: PatchNews[] = (
    await Promise.all(
      candidates.map(async ([appid, players]) =>
        (await fetchPatchNews(appid).catch(() => [])).map((item) => ({ appid, players, item }))
      )
    )
  ).flat()
  if (news.length === 0) return result

  const keys = news.map((n) => `patch:${n.item.gid}`)
  const known = new Set(
    (await query<{ key: string }>(sql.EXISTING_ALERTS, [JSON.stringify(keys)])).map((r) => r.key)
  )
  const toAlert = (n: PatchNews, summary?: string): Alert => ({
    key: `patch:${n.item.gid}`,
    kind: 'patch',
    appid: n.appid,
    line: `${meta.get(n.appid)?.name}: ${n.item.title.replace(/\s+/g, ' ')}`.slice(0, 200),
    url: newsUrl(n.appid, n.item.gid),
    players: n.players,
    ...(summary ? { summary } : {}),
  })
  const { summarize, overflow } = pickPatches(news, known, room, now)
  result.alerts.push(...overflow.map((n) => toAlert(n)))
  if (summarize.length === 0 || !(await underMonthCap(meter, now))) return result

  for (const n of summarize) {
    let reply
    try {
      reply = await respond(
        apiKey,
        {
          instructions: PATCH_INSTRUCTIONS,
          input: `Game: ${meta.get(n.appid)?.name}\nTitle: ${n.item.title}\n\n${newsText(n.item.contents)}`,
          max_output_tokens: 250,
        },
        AbortSignal.timeout(30_000)
      )
    } catch {
      result.failed = true
      break
    }
    await settle(meter, 'patch', '', reply.usd, now, 1)
    const summary = sanitize(reply.text, 600)
    if (isSkip(reply.text) || !summary) result.skipped.push(toAlert(n))
    else result.alerts.push(toAlert(n, summary))
  }
  return result
}

async function main(): Promise<void> {
  if (!process.env.CF_D1_TOKEN) {
    // In Actions a missing secret is a misconfiguration; locally there's simply nothing to do.
    if (process.env.CI) throw new Error('CF_D1_TOKEN is not set')
    console.log('CF_D1_TOKEN not set; nothing to do.')
    return
  }
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set')

  await ensureSchema()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const query: Query = async <T>(text: string, params: string[] = []): Promise<T[]> =>
    (await d1Query<T>(text, params)) ?? []

  const [members, owned, wishlist, metaRows, historyRows, posted] = await Promise.all([
    query<{ discord_id: string }>(sql.MEMBERS),
    query<OwnedRow>(sql.OWNED),
    query<{ discord_id: string; appid: number }>(sql.WISHLIST),
    query<AppMeta>(sql.APP_META),
    query<PriceHistory & { appid: number }>(sql.PRICE_HISTORY),
    query<{ n: number }>(sql.POSTED_SINCE, [new Date(now - 86_400_000).toISOString()]),
  ])
  const library = buildLibrary(members, owned, wishlist)
  const meta = new Map(metaRows.map((row) => [row.appid, row]))
  const history = new Map(historyRows.map((row) => [row.appid, row]))

  // Metadata: stop at the first Steam error, the rest waits for the next run.
  const alerts: Alert[] = []
  const metaUpdates: AppMeta[] = []
  let steamErrors = 0
  for (const appid of metaQueue(library, meta, now)) {
    try {
      const next = metaFrom(appid, await fetchAppDetails(appid, REGION), meta.get(appid), nowIso)
      alerts.push(...transitions(meta.get(appid), next))
      meta.set(appid, next)
      metaUpdates.push(next)
    } catch {
      steamErrors++
      break
    }
  }

  // Prices: only for apps a sale rule can fire on.
  const candidates = priceCandidates(library, meta)
  let prices = new Map<number, SteamPrice | null>()
  try {
    prices = await fetchPrices(candidates, REGION)
  } catch {
    steamErrors++
  }
  if (steamErrors > 0 && metaUpdates.length === 0 && prices.size === 0) {
    throw new Error('Every Steam request failed')
  }

  // Co-op picks for /together. A nice-to-have from an undocumented search, so any
  // Steam failure just keeps the current list.
  const picksAt = (await query<{ at: string | null }>(sql.PICKS_UPDATED))[0]?.at
  const picks =
    !picksAt || Date.parse(picksAt) < now - PICKS_EVERY_MS ? await fetchPicks().catch(() => []) : []

  const priceRows: { appid: number; final: number; initial: number; currency: string }[] = []
  for (const [appid, price] of prices) {
    const app = meta.get(appid)
    if (!price || !app) continue
    const sale = evaluateSale(app, price, history.get(appid), now)
    if (sale) alerts.push(sale)
    if (history.get(appid)?.last !== price.final) {
      priceRows.push({
        appid,
        final: price.final,
        initial: price.initial,
        currency: price.currency,
      })
    }
  }

  // Dedupe against earlier runs, then post the best up to the daily cap.
  const existing = await query<{ key: string; created_at: string }>(sql.EXISTING_ALERTS, [
    JSON.stringify(alerts.map((a) => a.key)),
  ])
  const seen = new Map(existing.map((row) => [row.key, row.created_at]))
  const fresh = alerts.filter((a) => isNew(a, seen, now))
  const slots = Math.max(0, DAILY_CAP - (posted[0]?.n ?? 0))

  // A nice-to-have: any Steam, OpenAI or meter trouble skips patch notes, never the sales.
  const outranking = fresh.filter((a) => a.kind === 'ea' || a.kind === 'release').length
  const patches = await patchAlerts(owned, meta, slots - outranking, now, query).catch(
    (): Patches => ({ alerts: [], skipped: [], failed: true })
  )
  const ranked = rank([...fresh, ...patches.alerts])
  const toPost = ranked.slice(0, slots)
  const overflow = ranked.slice(slots)

  const client = new DiscordClient(token)
  const record = (batch: Alert[], status: string) =>
    d1Query(sql.UPSERT_ALERTS, [
      JSON.stringify(batch.map(({ key, kind, appid, line }) => ({ key, kind, appid, line }))),
      status,
      nowIso,
    ])
  // Patch notes are recorded before posting, so a failure further down can't make the next
  // run pay for the same summaries again; a successful post upgrades the row to 'posted'.
  if (patches.alerts.length > 0) await record(patches.alerts, 'overflow')
  if (patches.skipped.length > 0) await record(patches.skipped, 'skip')
  for (const alert of toPost) {
    const app = meta.get(alert.appid)
    if (!app) continue
    await client.createMessage(ALERTS_CHANNEL_ID, {
      embeds: [
        alert.kind === 'patch' ? buildPatchEmbed(alert, app) : buildAlertEmbed(alert, app, library),
      ],
      allowed_mentions: { parse: [] },
    })
    // Recorded right after posting: if this write fails the run stops, costing one repeat at most.
    await record([alert], 'posted')
  }
  if (overflow.length > 0) await record(overflow, 'overflow')

  // Saved last: if anything above failed, the next run re-detects it and the dedupe
  // above stops double posts.
  await d1Batch([
    { sql: sql.UPSERT_META, params: [JSON.stringify(metaUpdates)] },
    { sql: sql.INSERT_PRICES, params: [JSON.stringify(priceRows), nowIso] },
    ...(picks.length > 0
      ? [
          { sql: sql.DELETE_PICKS },
          { sql: sql.INSERT_PICKS, params: [JSON.stringify(picks), nowIso] },
        ]
      : []),
  ])

  // Counts only: Actions logs are public.
  console.log(
    `Alerts: ${metaUpdates.length} store lookup(s), ${prices.size} price(s), ` +
      `${priceRows.length} price change(s), ${toPost.length} posted, ${overflow.length} over the daily cap` +
      (picks.length > 0 ? `, ${picks.length} co-op pick(s)` : '') +
      `, ${patches.alerts.length} patch note(s), ${patches.skipped.length} non-patch post(s)` +
      (patches.failed ? ', patch notes stopped on an error' : '') +
      (steamErrors > 0 ? ', stopped early on a Steam error' : '') +
      '.'
  )
}

main().catch((error) => {
  console.error('Alerts failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
