/** Wrap-up maths and text, kept pure so the tests can pin every number. */
import { cap } from '../ai'
import { newsUrl } from '../alerts/patches'
import type { SteamDiscount } from '../proposals/steam'

const ZONE = 'Europe/Dublin'
const TICK_MINUTES = 2 // the Worker samples voice every 2 min
/** Ticks apart that still count as one session (someone dropping out for a few minutes). */
const SESSION_GAP_TICKS = 3
/** An evening runs until 6 am, so a session past midnight counts toward the night it started. */
const EVENING_SHIFT_S = 6 * 3600

export interface Sample {
  ts: number // unix seconds, shared by every row of a tick
  discord_id: string
  channel_id: string
  appid: number | null
}

// Built once: it runs for every voice tick.
const DUBLIN_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
})

/** Dublin wall clock. weekday: 0 = Monday. */
export function dublin(ms: number): { date: string; hour: number; weekday: number } {
  const parts = Object.fromEntries(
    DUBLIN_PARTS.formatToParts(ms).map((part) => [part.type, part.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday ?? ''),
  }
}

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** 00:00 Dublin time on a date, as a UTC instant (Dublin is UTC+0 or UTC+1). */
export function dublinMidnight(date: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`)
  return utc - 3_600_000 * (dublin(utc - 3_600_000).date === date ? 1 : 0)
}

export interface Period {
  key: string
  from: number // ms, inclusive
  to: number // ms, exclusive
}

/**
 * The daily digest is due from 18:00 Dublin time. It looks back 2 days because rows
 * leave the digest by being marked listed, not by age: a later-than-usual run can't
 * skip any.
 */
export function dailyDue(now: number): Period | null {
  const { date, hour } = dublin(now)
  return hour >= 18 ? { key: `wrapup:daily:${date}`, from: now - 2 * 86_400_000, to: now } : null
}

/** From Monday 12:00 Dublin time: last week, which is 169 h when the clocks go back. */
export function weeklyDue(now: number): Period | null {
  const { date, hour, weekday } = dublin(now)
  if (weekday === 0 && hour < 12) return null
  const monday = addDays(date, -weekday)
  return {
    key: `wrapup:weekly:${monday}`,
    // 06:00 to 06:00, like the evenings, so a Sunday session past midnight stays in its week.
    // (Clocks change on a Sunday, so Monday 00:00 + 6 h is always 06:00.)
    from: dublinMidnight(addDays(monday, -7)) + EVENING_SHIFT_S * 1000,
    to: dublinMidnight(monday) + EVENING_SHIFT_S * 1000,
  }
}

export interface VoiceStats {
  minutes: number
  people: [string, number][]
  pairs: [string, string, number][]
  games: [number, number][]
  longest: { minutes: number; start: number; people: string[] } | null
  busiest: { start: number; minutes: number } | null
}

const top = <K>(counts: Map<K, number>, n: number): [K, number][] =>
  [...counts].sort((a, b) => b[1] - a[1]).slice(0, n)
const add = <K>(counts: Map<K, number>, key: K, minutes: number) =>
  counts.set(key, (counts.get(key) ?? 0) + minutes)

/** "Together" = 2+ opted-in members in the same channel at the same tick. */
export function voiceStats(samples: Sample[]): VoiceStats {
  const rooms = new Map<string, Sample[]>()
  for (const sample of samples) {
    const key = `${sample.ts}:${sample.channel_id}`
    rooms.set(key, [...(rooms.get(key) ?? []), sample])
  }

  const ticks = new Map<number, Set<string>>()
  const people = new Map<string, number>()
  const pairs = new Map<string, number>()
  const games = new Map<number, number>()
  for (const room of rooms.values()) {
    if (room.length < 2) continue
    const ts = room[0]?.ts as number
    const ids = room.map((s) => s.discord_id).sort()
    ticks.set(ts, new Set([...(ticks.get(ts) ?? []), ...ids]))
    for (const id of ids) add(people, id, TICK_MINUTES)
    ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => add(pairs, `${a} ${b}`, TICK_MINUTES)))
    for (const appid of new Set(room.flatMap((s) => (s.appid ? [s.appid] : [])))) {
      add(games, appid, TICK_MINUTES)
    }
  }

  // Sessions: together ticks with gaps of at most SESSION_GAP_TICKS.
  const sessions: { start: number; ticks: number; people: Set<string> }[] = []
  let last = -Infinity
  for (const ts of [...ticks.keys()].sort((a, b) => a - b)) {
    const current = sessions.at(-1)
    if (current && ts - last <= SESSION_GAP_TICKS * TICK_MINUTES * 60) {
      current.ticks++
      ticks.get(ts)?.forEach((id) => current.people.add(id))
    } else {
      sessions.push({ start: ts, ticks: 1, people: new Set(ticks.get(ts)) })
    }
    last = ts
  }
  const longest = sessions.reduce<(typeof sessions)[number] | null>(
    (best, s) => (!best || s.ticks > best.ticks ? s : best),
    null
  )

  const evenings = new Map<string, { start: number; minutes: number }>()
  for (const ts of ticks.keys()) {
    const date = dublin((ts - EVENING_SHIFT_S) * 1000).date
    const evening = evenings.get(date) ?? { start: ts, minutes: 0 }
    evenings.set(date, {
      start: Math.min(evening.start, ts),
      minutes: evening.minutes + TICK_MINUTES,
    })
  }
  const busiest = [...evenings.values()].sort((a, b) => b.minutes - a.minutes)[0] ?? null

  return {
    minutes: ticks.size * TICK_MINUTES,
    people: top(people, 10),
    pairs: top(pairs, 3).map(([key, minutes]) => {
      const [a = '', b = ''] = key.split(' ')
      return [a, b, minutes]
    }),
    games: top(games, 3),
    longest: longest
      ? {
          minutes: longest.ticks * TICK_MINUTES,
          start: longest.start,
          people: [...longest.people].sort(),
        }
      : null,
    busiest,
  }
}

export const duration = (minutes: number): string =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`

/** The night a tick belongs to, e.g. "Friday". */
const evening = (ts: number): string =>
  new Date((ts - EVENING_SHIFT_S) * 1000).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: ZONE,
  })

const range = (from: number, to: number): string => {
  const day = (ms: number) =>
    new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: ZONE })
  return `${day(from)} to ${day(to - EVENING_SHIFT_S * 1000 - 1)}`
}

const at = (id: string) => `<@${id}>`

function voiceLines(stats: VoiceStats, names: Map<number, string>): string[] {
  if (stats.minutes === 0) return ['**Together:** nobody was in voice together this week']
  const lines = [`**Together:** ${duration(stats.minutes)}`]
  if (stats.longest) {
    lines.push(
      `**Longest session:** ${duration(stats.longest.minutes)} on ${evening(stats.longest.start)}, ` +
        stats.longest.people.map(at).join(' ')
    )
  }
  if (stats.busiest) {
    lines.push(
      `**Busiest evening:** ${evening(stats.busiest.start)}, ${duration(stats.busiest.minutes)}`
    )
  }
  if (stats.pairs.length > 0) {
    lines.push(
      `**Most time together:** ${stats.pairs.map(([a, b, m]) => `${at(a)} & ${at(b)} ${duration(m)}`).join(' · ')}`
    )
  }
  const games = stats.games.flatMap(([appid, m]) => {
    const name = names.get(appid)
    return name ? [`${name} ${duration(m)}`] : []
  })
  if (games.length > 0) lines.push(`**Played together:** ${games.join(' · ')}`)
  lines.push(
    `**Per person:** ${stats.people.map(([id, m]) => `${at(id)} ${duration(m)}`).join(' · ')}`
  )
  return lines
}

export interface GameNews {
  /** What went to #game-news over the same week, per alert kind. */
  posted: { kind: string; n: number }[]
  /** #game-proposals games on sale now; null when Steam couldn't be reached. */
  sales: { proposals: number; onSale: SteamDiscount[] } | null
}

const KINDS: Record<string, [string, string]> = {
  sale: ['deal', 'deals'],
  patch: ['patch note', 'patch notes'],
  ea: ['Early Access exit', 'Early Access exits'],
  release: ['release', 'releases'],
}
const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`
const ENDING_SHOWN = 5

function newsLines({ posted, sales }: GameNews, now: number): string[] {
  const lines: string[] = []
  const total = posted.reduce((sum, row) => sum + Number(row.n), 0)
  if (total > 0) {
    const parts = posted
      .filter((row) => Number(row.n) > 0)
      .map((row) => plural(Number(row.n), KINDS[row.kind] ?? [row.kind, row.kind]))
    lines.push(`${plural(total, ['post', 'posts'])} in #game-news last week: ${parts.join(', ')}`)
  }
  if (sales && sales.onSale.length > 0) {
    const ending = sales.onSale
      .filter((d) => d.endsAt !== null && d.endsAt > now && d.endsAt <= now + 7 * 86_400_000)
      .sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0))
    const weekday = (ms: number) =>
      new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', timeZone: ZONE })
    const shown = ending
      .slice(0, ENDING_SHOWN)
      .map(
        (d) =>
          `[${escapeLink(d.name)}](<https://store.steampowered.com/app/${d.appid}/>) −${d.pct}% (${weekday(d.endsAt ?? 0)})`
      )
    const more = ending.length - shown.length
    lines.push(
      `${sales.onSale.length} of ${sales.proposals} #game-proposals games are on sale` +
        (shown.length > 0
          ? `. Ending this week: ${shown.join(' · ')}${more > 0 ? ` · +${more} more` : ''}`
          : '')
    )
  }
  return lines
}

/** null when there's nothing to say: no time together and no game news. */
export function renderWeekly(
  stats: VoiceStats,
  names: Map<number, string>,
  from: number,
  to: number,
  news: GameNews,
  now: number
): string | null {
  const gameNews = newsLines(news, now)
  if (stats.minutes === 0 && gameNews.length === 0) return null
  return cap(
    [
      `**The week** (${range(from, to)})`,
      ...voiceLines(stats, names),
      ...(gameNews.length > 0 ? ['', '**Game news**', ...gameNews] : []),
    ].join('\n'),
    2000
  )
}

/** A bracket in a game or post title would end Discord's link text early. */
const escapeLink = (text: string) => text.replace(/[[\]]/g, '\\$&')

const DIGEST_LINES = 8

/** Alerts that went over the 5-a-day cap, linked (patch notes to the notes); null if none. */
export function renderDaily(
  rows: { key: string; appid: number | null; line: string | null }[]
): string | null {
  const lines = rows.flatMap(({ key, appid, line }) => {
    if (!line) return []
    if (!appid) return [`• ${line}`]
    const url = key.startsWith('patch:')
      ? newsUrl(appid, key.slice('patch:'.length))
      : `https://store.steampowered.com/app/${appid}/`
    return [`• [${escapeLink(line)}](<${url}>)`]
  })
  if (lines.length === 0) return null

  const head = '**Also today** (past the 5-a-day limit)'
  const shown: string[] = []
  for (const line of lines) {
    // Whole lines only, leaving room for "+N more" under Discord's 2,000 characters.
    if (shown.length === DIGEST_LINES || [head, ...shown, line].join('\n').length > 1900) break
    shown.push(line)
  }
  const more = lines.length - shown.length
  return [head, ...shown, ...(more > 0 ? [`+${more} more`] : [])].join('\n')
}
