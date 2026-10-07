import { voiceState } from './voice'

const PER_SECTION = 4

export interface OwnedRow {
  appid: number
  name: string
  owners: string // JSON array of Discord IDs
  minutes: number
  recent: number
  final: number | null
  initial: number | null
  currency: string | null
}

export interface WishedRow {
  appid: number
  name: string
  wishers: string // JSON array of Discord IDs
}

export interface PickRow {
  appid: number
  name: string
  reviews: string
}

// ?1: JSON array of the group's Discord IDs. ?2..?3: how many of them must own it.
// The price join uses SQLite's bare-column rule: final/initial/currency come from the
// MAX(ts) row, i.e. the latest price we recorded.
export const OWNED_SQL = `SELECT o.appid, a.name, json_group_array(m.discord_id) AS owners,
  SUM(o.playtime_forever) AS minutes, SUM(o.playtime_2weeks) AS recent,
  p.final, p.initial, p.currency
FROM owned_games o
JOIN members m ON m.steam_id = o.steam_id
JOIN app_meta a ON a.appid = o.appid AND a.coop = 1 AND a.name IS NOT NULL
LEFT JOIN (SELECT appid, final, initial, currency, MAX(ts) FROM price_changes GROUP BY appid) p
  ON p.appid = o.appid
WHERE m.discord_id IN (SELECT value FROM json_each(?1))
GROUP BY o.appid
HAVING COUNT(*) BETWEEN ?2 AND ?3
ORDER BY COUNT(*) DESC, recent DESC, minutes DESC
LIMIT ${PER_SECTION}`

const NOT_OWNED_BY_GROUP = `NOT IN (SELECT o.appid FROM owned_games o
  JOIN members g ON g.steam_id = o.steam_id
  WHERE g.discord_id IN (SELECT value FROM json_each(?1)))`

/** Released co-op games on anyone's wishlist that nobody in the group owns. */
export const WISHED_SQL = `SELECT w.appid, a.name, json_group_array(m.discord_id) AS wishers
FROM wishlist w
JOIN members m ON m.steam_id = w.steam_id
JOIN app_meta a ON a.appid = w.appid AND a.coop = 1 AND a.coming_soon = 0 AND a.name IS NOT NULL
WHERE w.appid ${NOT_OWNED_BY_GROUP}
GROUP BY w.appid
ORDER BY COUNT(*) DESC
LIMIT 2`

/** Steam's popular new co-op games (src/alerts/picks.ts) that nobody in the group owns. */
export const PICKS_SQL = `SELECT appid, name, reviews FROM discover
WHERE appid ${NOT_OWNED_BY_GROUP}
ORDER BY rank
LIMIT ${PER_SECTION}`

/**
 * Who's in the caller's voice channel. Voice states are looked up live and never
 * stored; with fewer than two linked people in the channel it falls back to everyone.
 */
export async function together(db: D1Database, token: string, callerId: string): Promise<string> {
  const { results } = await db
    .prepare('SELECT discord_id FROM members ORDER BY linked_at')
    .all<{ discord_id: string }>()
  const linked = results.map((m) => m.discord_id)
  if (linked.length === 0) return 'Nobody has linked a Steam profile yet. Use /link to start.'

  const lookup = linked.includes(callerId) ? linked : [...linked, callerId]
  const states = await Promise.all(lookup.map((id) => voiceState(token, id).catch(() => null)))
  const channel = states[lookup.indexOf(callerId)]?.channel_id
  const inVoice = channel ? linked.filter((_, i) => states[i]?.channel_id === channel) : []
  const group = inVoice.length >= 2 ? inVoice : linked

  const ids = JSON.stringify(group)
  const n = group.length
  const [all, some, wished, picks] = await db.batch([
    db.prepare(OWNED_SQL).bind(ids, n, n),
    db.prepare(OWNED_SQL).bind(ids, Math.ceil(n / 2), n - 1),
    db.prepare(WISHED_SQL).bind(ids),
    db.prepare(PICKS_SQL).bind(ids),
  ])
  return renderTogether(
    group,
    inVoice.length >= 2,
    (all?.results ?? []) as OwnedRow[],
    (some?.results ?? []) as OwnedRow[],
    (wished?.results ?? []) as WishedRow[],
    (picks?.results ?? []) as PickRow[]
  )
}

// <…> around the URL stops Discord from attaching a store preview card per line.
const game = (row: { appid: number; name: string }) =>
  `[${row.name}](<https://store.steampowered.com/app/${row.appid}/>)`
const mentions = (ids: string[]) => ids.map((id) => `<@${id}>`).join(' ')

function price(row: OwnedRow): string {
  if (row.final === null || row.currency === null) return ''
  const amount = new Intl.NumberFormat('en-IE', { style: 'currency', currency: row.currency })
  const off = row.initial ? Math.round(100 - (row.final * 100) / row.initial) : 0
  return ` · ${amount.format(row.final / 100)}${off > 0 ? ` (−${off}%)` : ''}`
}

function played(row: OwnedRow): string {
  if (row.minutes < 60) return 'not really played yet'
  const hours = `${Math.round(row.minutes / 60)} h between you`
  return row.recent > 0 ? `${hours}, played lately` : hours
}

export function renderTogether(
  group: string[],
  inVoice: boolean,
  all: OwnedRow[],
  some: OwnedRow[],
  wished: WishedRow[],
  picks: PickRow[]
): string {
  const who = inVoice
    ? `the ${group.length} of you in voice (${mentions(group)})`
    : `everyone linked, since you're not in voice with anyone linked`
  const section = (title: string, lines: string[]) =>
    [`**${title}**`, ...(lines.length > 0 ? lines : ['Nothing yet.'])].join('\n')

  const seen = new Set(wished.map((w) => w.appid))
  const fresh = [
    ...wished.map(
      (w) => `• ${game(w)} · wishlisted by ${mentions(JSON.parse(w.wishers) as string[])}`
    ),
    ...picks
      .filter((p) => !seen.has(p.appid))
      .map((p) => `• ${game(p)} · new on Steam, ${p.reviews}`),
  ].slice(0, PER_SECTION)

  const message = [
    `Co-op games for ${who}:`,
    section(
      'You all own',
      all.map((row) => `• ${game(row)} · ${played(row)}`)
    ),
    section(
      'One purchase away',
      some.map((row) => {
        const owners = new Set(JSON.parse(row.owners) as string[])
        const missing = group.filter((id) => !owners.has(id))
        return `• ${game(row)} · missing ${mentions(missing)}${price(row)}`
      })
    ),
    section('New to all of you', fresh),
  ].join('\n\n')
  return message.slice(0, 2000)
}
