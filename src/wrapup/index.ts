/**
 * Wrap-ups, a step of the hourly feed run: the daily digest of alerts that went over
 * the 5-a-day cap (from 18:00), and the weekly recap (from Monday 12:00): voice time,
 * plus what went to #game-news and which #game-proposals games are on sale. Each is
 * recorded in `alerts` once done, so a missed run catches up on the next one.
 * `--preview` (wrapup-preview.yml) posts to #test, ignores the schedule, records nothing.
 * Code writes every word: no AI here. Logs counts only, because Actions logs are public.
 */
import { d1Batch, d1Query, ensureSchema } from '../d1'
import { DiscordClient } from '../discord/client'
import { ALERTS_CHANNEL_ID } from '../alerts/rules'
import * as sql from '../alerts/sql'
import { fetchDiscounts } from '../proposals/steam'
import { loadProposals } from '../proposals/store'
import {
  dailyDue,
  renderDaily,
  renderWeekly,
  voiceStats,
  weeklyDue,
  type Period,
  type Sample,
} from './stats'

const TEST_CHANNEL_ID = '1557377666246770729'
/** #test until the first recap has been checked there; then #general. */
const WEEKLY_CHANNEL_ID = TEST_CHANNEL_ID
const DAY_MS = 86_400_000
const REGION = { cc: 'IE', lang: 'english' }

async function main(): Promise<void> {
  if (!process.env.CF_D1_TOKEN) {
    if (process.env.CI) throw new Error('CF_D1_TOKEN is not set')
    console.log('CF_D1_TOKEN not set; nothing to do.')
    return
  }
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set')

  await ensureSchema()
  const now = Date.now()
  const query = async <T>(text: string, params: string[] = []): Promise<T[]> =>
    (await d1Query<T>(text, params)) ?? []
  const client = new DiscordClient(token)
  const post = (channelId: string, content: string) =>
    client.createMessage(channelId, { content, allowed_mentions: { parse: [] } })

  const daily = async (period: Period) => {
    const rows = await query<{ key: string; appid: number | null; line: string | null }>(
      sql.OVERFLOW_SINCE,
      [new Date(period.from).toISOString()]
    )
    return { message: renderDaily(rows), keys: rows.map((row) => row.key) }
  }
  const weekly = async (period: Period) => {
    const iso = (ms: number) => new Date(ms).toISOString()
    const proposals = Object.values(loadProposals().proposals)
      .filter((p) => p.kind === 'app')
      .map((p) => p.id)
    const [samples, posted, onSale] = await Promise.all([
      query<Sample>(sql.VOICE_SAMPLES, [
        String(Math.floor(period.from / 1000)),
        String(Math.floor(period.to / 1000)),
      ]),
      query<{ kind: string; n: number }>(sql.POSTED_BY_KIND, [iso(period.from), iso(period.to)]),
      // Fail-soft: without Steam the recap just leaves out the sale line.
      fetchDiscounts(proposals, REGION).catch(() => null),
    ])
    const stats = voiceStats(samples)
    const names = await query<{ appid: number; name: string }>(sql.APP_NAMES, [
      JSON.stringify(stats.games.map(([appid]) => appid)),
    ])
    return renderWeekly(
      stats,
      new Map(names.map((n) => [n.appid, n.name])),
      period.from,
      period.to,
      { posted, sales: onSale && { proposals: proposals.length, onSale } },
      now
    )
  }

  // A preview never falls through to the real, recorded run, even without WRAPUP_KIND.
  const preview = process.argv.includes('--preview')
    ? process.env.WRAPUP_KIND || 'weekly'
    : undefined
  if (preview) {
    const period = { key: 'preview', from: now - (preview === 'daily' ? 1 : 7) * DAY_MS, to: now }
    const message = preview === 'daily' ? (await daily(period)).message : await weekly(period)
    await post(TEST_CHANNEL_ID, message ?? `Preview: nothing to post for ${preview}.`)
    console.log(`Posted a ${preview} preview to #test.`)
    return
  }

  const due = { daily: dailyDue(now), weekly: weeklyDue(now) }
  const keys = [due.daily?.key, due.weekly?.key].filter((key): key is string => Boolean(key))
  const done = new Set(
    (await query<{ key: string }>(sql.EXISTING_ALERTS, [JSON.stringify(keys)])).map((r) => r.key)
  )
  const record = (key: string) => ({
    sql: sql.UPSERT_ALERTS,
    params: [
      JSON.stringify([{ key, kind: 'wrapup', appid: null, line: null }]),
      'done',
      new Date(now).toISOString(),
    ],
  })
  const log: string[] = []

  if (due.daily && !done.has(due.daily.key)) {
    const { message, keys: listed } = await daily(due.daily)
    if (message) await post(ALERTS_CHANNEL_ID, message)
    await d1Batch([
      { sql: sql.MARK_LISTED, params: [JSON.stringify(listed)] },
      record(due.daily.key),
    ])
    log.push(`daily digest: ${listed.length} line(s)`)
  }

  if (due.weekly && !done.has(due.weekly.key)) {
    // The weekly run also keeps PRIVACY.md's promises: voice samples go after 400 days.
    // Purged before posting, so a failed purge can't re-post the recap next hour.
    await d1Batch([
      { sql: sql.PURGE_VOICE, params: [String(Math.floor((now - 400 * DAY_MS) / 1000))] },
      { sql: sql.PURGE_SPEND, params: [new Date(now - 62 * DAY_MS).toISOString().slice(0, 10)] },
    ])
    const message = await weekly(due.weekly)
    if (message) await post(WEEKLY_CHANNEL_ID, message)
    await d1Batch([record(due.weekly.key)])
    log.push(`weekly recap: ${message ? 'posted' : 'quiet week'}`)
  }

  console.log(`Wrap-ups: ${log.join(', ') || 'nothing due'}.`)
}

main().catch((error) => {
  console.error('Wrap-up failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
