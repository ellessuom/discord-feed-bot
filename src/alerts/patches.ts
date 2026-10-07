import { htmlToText } from '../utils/html-to-text'

/** A game counts as "being played" with this many minutes across the group in 2 weeks. */
const RECENT_MINUTES = 120
export const PATCH_WINDOW_MS = 48 * 3_600_000

export const PATCH_INSTRUCTIONS = `You summarize Steam update posts for friends who play the game.
If the post doesn't describe changes shipped to the game (an event, sale, contest, merch, \
roadmap or devlog), reply exactly SKIP.
Otherwise reply with 2-4 short bullets, each starting with "- ", on what changed that a \
player would notice. No intro, no links, no headings.`

export interface NewsItem {
  gid: string
  title: string
  contents: string
  /** Unix seconds. */
  date: number
}

/** Apps the group played ≥2 h in the last 2 weeks → who played them, most first. */
export function patchCandidates(
  owned: { discord_id: string; appid: number; playtime_2weeks: number }[]
): Map<number, string[]> {
  const recent = new Map<number, { minutes: number; players: [string, number][] }>()
  for (const row of owned) {
    if (row.playtime_2weeks <= 0) continue
    const entry = recent.get(row.appid) ?? { minutes: 0, players: [] }
    entry.minutes += row.playtime_2weeks
    entry.players.push([row.discord_id, row.playtime_2weeks])
    recent.set(row.appid, entry)
  }
  return new Map(
    [...recent]
      .filter(([, entry]) => entry.minutes >= RECENT_MINUTES)
      .map(([appid, entry]) => [appid, entry.players.sort((a, b) => b[1] - a[1]).map(([id]) => id)])
  )
}

/** Official announcements only. Public data, but errors stay generic: Actions logs are public. */
export async function fetchPatchNews(appid: number): Promise<NewsItem[]> {
  const response = await fetch(
    `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=3&maxlength=0&feeds=steam_community_announcements`,
    { signal: AbortSignal.timeout(5000) }
  )
  if (!response.ok) throw new Error(`Steam news failed: HTTP ${response.status}`)
  const data = (await response.json()) as { appnews?: { newsitems?: NewsItem[] } }
  return data.appnews?.newsitems ?? []
}

/** Steam's BBCode (and occasional HTML) → plain text for the model. */
export function newsText(contents: string): string {
  return htmlToText(
    contents
      .replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, '')
      .replace(/\[\*\]/g, '\n- ')
      .replace(/\[\/(?:p|h\d|list|olist)\]/gi, '\n')
      .replace(/\[\/?[^\]]+\]/g, ''),
    6000
  )
}

export const newsUrl = (appid: number, gid: string) =>
  `https://store.steampowered.com/news/app/${appid}/view/${gid}`
