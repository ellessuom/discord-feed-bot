/** Wrap-up maths and text, kept pure so the tests can pin every number. */

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

/** Dublin wall clock. weekday: 0 = Monday. */
export function dublin(ms: number): { date: string; hour: number; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(ms)
      .map((part) => [part.type, part.value])
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

/** The daily digest is due from 18:00 Dublin time. */
export function dailyDue(now: number): Period | null {
  const { date, hour } = dublin(now)
  return hour >= 18 ? { key: `wrapup:daily:${date}`, from: now - 86_400_000, to: now } : null
}

/** From Monday 12:00 Dublin time: last Monday-to-Monday, which is 169 h when the clocks go back. */
export function weeklyDue(now: number): Period | null {
  const { date, hour, weekday } = dublin(now)
  if (weekday === 0 && hour < 12) return null
  const monday = addDays(date, -weekday)
  return {
    key: `wrapup:weekly:${monday}`,
    from: dublinMidnight(addDays(monday, -7)),
    to: dublinMidnight(monday),
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
  return `${day(from)} to ${day(to - 1)}`
}

const at = (id: string) => `<@${id}>`

/** null on a week with no time together: nothing worth posting. */
export function renderWeekly(
  stats: VoiceStats,
  names: Map<number, string>,
  from: number,
  to: number
): string | null {
  if (stats.minutes === 0) return null
  const lines = [
    `**The week in voice** (${range(from, to)})`,
    `**Together:** ${duration(stats.minutes)}`,
  ]
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
  return lines.join('\n')
}

const DIGEST_LINES = 8

/** Alerts that went over the 5-a-day cap; null when there were none. */
export function renderDaily(rows: { appid: number | null; line: string | null }[]): string | null {
  const lines = rows.flatMap((row) =>
    row.line
      ? [
          row.appid
            ? `• [${row.line}](<https://store.steampowered.com/app/${row.appid}/>)`
            : `• ${row.line}`,
        ]
      : []
  )
  if (lines.length === 0) return null
  const more = lines.length - DIGEST_LINES
  return [
    '**Also today** (past the 5-a-day limit)',
    ...lines.slice(0, DIGEST_LINES),
    ...(more > 0 ? [`+${more} more`] : []),
  ]
    .join('\n')
    .slice(0, 2000)
}
