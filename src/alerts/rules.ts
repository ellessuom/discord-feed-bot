import type { DiscordEmbed } from '../discord/client'
import { formatPrice } from '../proposals/forum'
import type { SteamLookup, SteamPrice } from '../proposals/steam'

export const DAILY_CAP = 5
export const META_PER_RUN = 150
/** #game-news: sale, Early Access, release and patch-note posts, and the 18:00 digest. */
export const ALERTS_CHANNEL_ID = '1493953981246869556'
const DAY_MS = 86_400_000
const SALE_DISCOUNT = 40
const PLAYED_MINUTES = 120
const REPOST_AFTER_MS = 30 * DAY_MS
const LOWEST_AFTER_MS = 30 * DAY_MS
const STEAM_COLOR = 0x1b2838

/** Linked members' libraries. Only linked members appear anywhere. */
export interface Library {
  /** Every linked Discord ID, in a stable order. */
  members: string[]
  /** appid → Discord ID → minutes played */
  owners: Map<number, Map<string, number>>
  wishers: Map<number, Set<string>>
}

export interface AppMeta {
  appid: number
  name: string | null
  coop: number
  early_access: number
  coming_soon: number
  header_image: string | null
  has_data: number
  fetched_at: string
}

export interface PriceHistory {
  lowest: number
  since: string
  last: number
}

export interface Alert {
  key: string
  kind: 'sale' | 'ea' | 'release' | 'patch'
  appid: number
  /** Game only, never people: it's stored and shown in the daily wrap-up. */
  line: string
  price?: SteamPrice
  lowestSince?: string
  /** Patch notes: the AI's bullets (absent when it won't get a slot), the post, who played lately. */
  summary?: string
  url?: string
  players?: string[]
}

export function buildLibrary(
  members: { discord_id: string }[],
  owned: { discord_id: string; appid: number; playtime_forever: number }[],
  wishlist: { discord_id: string; appid: number }[]
): Library {
  const library: Library = {
    members: members.map((m) => m.discord_id),
    owners: new Map(),
    wishers: new Map(),
  }
  for (const row of owned) {
    const byMember = library.owners.get(row.appid) ?? new Map<string, number>()
    library.owners.set(row.appid, byMember.set(row.discord_id, row.playtime_forever))
  }
  for (const row of wishlist) {
    const ids = library.wishers.get(row.appid) ?? new Set<string>()
    library.wishers.set(row.appid, ids.add(row.discord_id))
  }
  return library
}

const mostPlayed = (library: Library, appid: number): number =>
  Math.max(0, ...(library.owners.get(appid)?.values() ?? []))

/**
 * Which apps to look up on the store this run. Only apps that can alert or show
 * up in /together: wishlisted, played ≥2 h by someone, or owned by two or more
 * (an owned game nobody has played can't fire a sale). New wishlisted apps
 * first, then new owned ones most recently played first (the OWNED query's
 * order); then Early Access / unreleased apps once a day, and empty lookups
 * once a week.
 */
export function metaQueue(library: Library, meta: Map<number, AppMeta>, now: number): number[] {
  const tracked = (appid: number) =>
    library.wishers.has(appid) ||
    (library.owners.get(appid)?.size ?? 0) >= 2 ||
    mostPlayed(library, appid) >= PLAYED_MINUTES
  const isNew = (appid: number) => !meta.has(appid)
  const olderThan = (row: AppMeta, ms: number) => Date.parse(row.fetched_at) < now - ms
  const rows = [...meta.values()].filter((row) => tracked(row.appid))

  const tiers = [
    [...library.wishers.keys()].filter(isNew),
    [...library.owners.keys()].filter((appid) => isNew(appid) && tracked(appid)),
    rows
      .filter((r) => r.has_data && (r.early_access || r.coming_soon) && olderThan(r, DAY_MS))
      .map((r) => r.appid),
    rows.filter((r) => !r.has_data && olderThan(r, 7 * DAY_MS)).map((r) => r.appid),
  ]
  return [...new Set(tiers.flat())].slice(0, META_PER_RUN)
}

/** A failed or empty lookup keeps what we knew, so it can never fake a transition. */
export function metaFrom(
  appid: number,
  lookup: SteamLookup,
  previous: AppMeta | undefined,
  now: string
): AppMeta {
  if (lookup.state !== 'ok') {
    return previous
      ? { ...previous, fetched_at: now }
      : {
          appid,
          name: null,
          coop: 0,
          early_access: 0,
          coming_soon: 0,
          header_image: null,
          has_data: 0,
          fetched_at: now,
        }
  }
  const { details } = lookup
  return {
    appid,
    name: details.name,
    // Same rule as the forum's co-op tag (deriveTags).
    coop: details.categories.some((c) => /co-?op/i.test(c)) ? 1 : 0,
    early_access: details.genres.includes('Early Access') ? 1 : 0,
    coming_soon: details.comingSoon ? 1 : 0,
    header_image: details.headerImage ?? null,
    has_data: 1,
    fetched_at: now,
  }
}

export function transitions(previous: AppMeta | undefined, next: AppMeta): Alert[] {
  if (!previous?.has_data || !next.has_data || !next.name) return []
  const alerts: Alert[] = []
  if (previous.early_access && !next.early_access) {
    alerts.push({
      key: `ea:${next.appid}`,
      kind: 'ea',
      appid: next.appid,
      line: `${next.name} left Early Access`,
    })
  }
  if (previous.coming_soon && !next.coming_soon) {
    alerts.push({
      key: `release:${next.appid}`,
      kind: 'release',
      appid: next.appid,
      line: `${next.name} is out now`,
    })
  }
  return alerts
}

/**
 * Apps whose price matters: co-op games someone has played ≥2 h that not
 * everyone owns, and wishlisted games the group shares an interest in (co-op,
 * wishlisted by ≥2, or already owned by someone). Steam already emails each
 * person about their own wishlist.
 */
export function priceCandidates(library: Library, meta: Map<number, AppMeta>): number[] {
  const apps = new Set([...library.owners.keys(), ...library.wishers.keys()])
  return [...apps].filter((appid) => {
    const row = meta.get(appid)
    if (!row?.has_data || !row.name) return false
    const owners = library.owners.get(appid)?.size ?? 0
    const wishers = library.wishers.get(appid)?.size ?? 0
    const coopSale =
      row.coop === 1 &&
      mostPlayed(library, appid) >= PLAYED_MINUTES &&
      owners < library.members.length
    const wishlistSale = wishers > 0 && (row.coop === 1 || wishers >= 2 || owners > 0)
    return coopSale || wishlistSale
  })
}

const monthYear = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/**
 * Only on a run where the price changed (a sale that's still running never
 * re-posts): ≥40% off, or below every earlier price once there's ≥30 days of
 * history. With less history "lowest" would be meaningless.
 */
export function evaluateSale(
  app: AppMeta,
  price: SteamPrice,
  history: PriceHistory | undefined,
  now: number
): Alert | null {
  if (history && history.last === price.final) return null
  const lowest =
    history !== undefined &&
    price.discount_percent > 0 &&
    price.final < history.lowest &&
    Date.parse(history.since) <= now - LOWEST_AFTER_MS
  if (price.discount_percent < SALE_DISCOUNT && !lowest) return null

  const label = lowest ? `, lowest since ${monthYear(history.since)}` : ''
  return {
    key: `sale:${app.appid}:${price.final}`,
    kind: 'sale',
    appid: app.appid,
    line: `${app.name} −${price.discount_percent}% (${formatPrice(price.final, price.currency)}${label})`,
    price,
    ...(lowest ? { lowestSince: history.since } : {}),
  }
}

/** Early Access / release and sales never seen before; a sale may re-post after 30 days. */
export function isNew(alert: Alert, existing: Map<string, string>, now: number): boolean {
  const postedAt = existing.get(alert.key)
  if (postedAt === undefined) return true
  return alert.kind === 'sale' && Date.parse(postedAt) < now - REPOST_AFTER_MS
}

/**
 * Best first: Early Access / release (rare, one-off), then patch notes for games the
 * group is playing, then lowest-seen, then biggest discount.
 */
export function rank(alerts: Alert[]): Alert[] {
  const score = (a: Alert) =>
    a.kind === 'ea' || a.kind === 'release' ? 3 : a.kind === 'patch' ? 2 : a.lowestSince ? 1 : 0
  return [...alerts].sort(
    (a, b) =>
      score(b) - score(a) || (b.price?.discount_percent ?? 0) - (a.price?.discount_percent ?? 0)
  )
}

const hours = (minutes: number): string =>
  minutes === 0 ? '' : minutes < 60 ? ' (<1 h)' : ` (${Math.round(minutes / 60)} h)`

/** Mentions render as names; the post itself sends `allowed_mentions: {parse: []}`. */
export function buildAlertEmbed(alert: Alert, app: AppMeta, library: Library): DiscordEmbed {
  const name = app.name ?? `Steam app ${app.appid}`
  const title =
    alert.kind === 'ea'
      ? `${name} left Early Access`
      : alert.kind === 'release'
        ? `${name} is out now`
        : name
  const embed: DiscordEmbed = {
    title: title.slice(0, 256),
    url: `https://store.steampowered.com/app/${app.appid}/`,
    color: STEAM_COLOR,
    fields: [],
  }

  if (alert.price) {
    const { initial, final, discount_percent, currency } = alert.price
    const lowest = alert.lowestSince ? ` · lowest since ${monthYear(alert.lowestSince)}` : ''
    embed.description = `~~${formatPrice(initial, currency)}~~ → **${formatPrice(final, currency)}** (−${discount_percent}%)${lowest}`
  }
  if (app.header_image) embed.image = { url: app.header_image }

  const owners = [...(library.owners.get(app.appid) ?? new Map<string, number>())].sort(
    (a, b) => b[1] - a[1]
  )
  const wishers = library.wishers.get(app.appid) ?? new Set<string>()
  const missing = library.members.filter((id) => !library.owners.get(app.appid)?.has(id))
  if (owners.length > 0) {
    embed.fields?.push({
      name: 'Owns it',
      value: owners.map(([id, minutes]) => `<@${id}>${hours(minutes)}`).join(', '),
      inline: true,
    })
  }
  if (missing.length > 0) {
    embed.fields?.push({
      name: "Doesn't own",
      value: missing.map((id) => `<@${id}>${wishers.has(id) ? ' (wishlisted)' : ''}`).join(', '),
      inline: true,
    })
  }
  return embed
}

/** Patch notes for a game someone in the group is playing; mentions never ping. */
export function buildPatchEmbed(alert: Alert, app: AppMeta): DiscordEmbed {
  const embed: DiscordEmbed = {
    title: alert.line.slice(0, 256),
    url: alert.url ?? `https://store.steampowered.com/app/${app.appid}/`,
    color: STEAM_COLOR,
    description: alert.summary ?? 'A new update is out; the full notes are on Steam.',
    fields: [],
  }
  if (alert.players && alert.players.length > 0) {
    embed.fields?.push({
      name: 'Played lately',
      value: alert.players.map((id) => `<@${id}>`).join(', '),
      inline: true,
    })
  }
  if (app.header_image) embed.image = { url: app.header_image }
  return embed
}
