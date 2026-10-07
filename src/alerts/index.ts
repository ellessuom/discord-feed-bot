/**
 * Hourly #game-news alerts: sales on co-op games the group plays or wishlists,
 * Early Access exits and releases. All state lives in D1, so this never commits.
 * It fails loudly (exit 1) on any D1 or Discord error, so GitHub emails the owner.
 */
import { d1Batch, d1Query, ensureSchema } from '../d1'
import { DiscordClient } from '../discord/client'
import { fetchAppDetails, fetchPrices, type SteamPrice } from '../proposals/steam'
import { fetchPicks } from './picks'
import {
  DAILY_CAP,
  buildAlertEmbed,
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

/** #test while the alerts are being tried out; #game-news once they go live. */
const ALERTS_CHANNEL_ID = '1557377666246770729'
const REGION = { cc: 'IE', lang: 'english' }
/** "Daily", with slack for a run that starts a little early. */
const PICKS_EVERY_MS = 20 * 3_600_000

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
  const query = async <T>(text: string, params: string[] = []): Promise<T[]> =>
    (await d1Query<T>(text, params)) ?? []

  const [members, owned, wishlist, metaRows, historyRows, posted] = await Promise.all([
    query<{ discord_id: string }>(sql.MEMBERS),
    query<{ discord_id: string; appid: number; playtime_forever: number }>(sql.OWNED),
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
  const fresh = rank(alerts.filter((a) => isNew(a, seen, now)))
  const slots = Math.max(0, DAILY_CAP - (posted[0]?.n ?? 0))
  const toPost = fresh.slice(0, slots)
  const overflow = fresh.slice(slots)

  const client = new DiscordClient(token)
  const record = (batch: Alert[], status: string) =>
    d1Query(sql.UPSERT_ALERTS, [
      JSON.stringify(batch.map(({ key, kind, appid, line }) => ({ key, kind, appid, line }))),
      status,
      nowIso,
    ])
  for (const alert of toPost) {
    const app = meta.get(alert.appid)
    if (!app) continue
    await client.createMessage(ALERTS_CHANNEL_ID, {
      embeds: [buildAlertEmbed(alert, app, library)],
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
      (steamErrors > 0 ? ', stopped early on a Steam error' : '') +
      '.'
  )
}

main().catch((error) => {
  console.error('Alerts failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
