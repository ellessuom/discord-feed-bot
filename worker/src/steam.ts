const API = 'https://api.steampowered.com'
const STORE = 'https://store.steampowered.com'

export interface OwnedGame {
  appid: number
  playtime_forever: number
  playtime_2weeks?: number
}

export interface WishlistItem {
  appid: number
  date_added?: number
}

export interface Player {
  steamid: string
  personaname: string
  /** 3 = public; anything else hides the profile from the API. */
  communityvisibilitystate: number
}

export type ProfileRef = { steamId: string } | { vanity: string }

/** Accepts a profile URL, a custom URL name, or a SteamID64. */
export function parseProfileInput(input: string): ProfileRef | null {
  const text = input.trim().replace(/\/+$/, '')
  const byId = text.match(/steamcommunity\.com\/profiles\/(\d{17})/)
  if (byId?.[1]) return { steamId: byId[1] }
  const byVanity = text.match(/steamcommunity\.com\/id\/([^/?#]+)/)
  if (byVanity?.[1]) return { vanity: byVanity[1] }
  if (/^7656\d{13}$/.test(text)) return { steamId: text }
  if (/^[A-Za-z0-9_-]{2,32}$/.test(text)) return { vanity: text }
  return null
}

/** A store link or a bare appid; anything else is treated as a search term. */
export function parseAppInput(input: string): number | null {
  const text = input.trim()
  const fromUrl = text.match(/store\.steampowered\.com\/app\/(\d+)/)
  if (fromUrl?.[1]) return Number(fromUrl[1])
  return /^\d{1,10}$/.test(text) ? Number(text) : null
}

/** Errors name the method only: the request URL carries the API key and must never reach a log or a reply. */
async function steamApi<T>(method: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(`${API}/${method}/?${new URLSearchParams(params)}`)
  if (!response.ok) throw new Error(`Steam ${method} failed: HTTP ${response.status}`)
  return (await response.json()) as T
}

export async function resolveSteamId(ref: ProfileRef, key: string): Promise<string | null> {
  if ('steamId' in ref) return ref.steamId
  const data = await steamApi<{ response: { success: number; steamid?: string } }>(
    'ISteamUser/ResolveVanityURL/v1',
    { key, vanityurl: ref.vanity }
  )
  return data.response.success === 1 ? (data.response.steamid ?? null) : null
}

export async function getPlayer(steamId: string, key: string): Promise<Player | null> {
  const data = await steamApi<{ response: { players: Player[] } }>(
    'ISteamUser/GetPlayerSummaries/v2',
    { key, steamids: steamId }
  )
  return data.response.players[0] ?? null
}

/** null means the profile's "Game details" are not public (Steam returns an empty object). */
export async function getOwnedGames(steamId: string, key: string): Promise<OwnedGame[] | null> {
  const data = await steamApi<{ response: { games?: OwnedGame[] } }>(
    'IPlayerService/GetOwnedGames/v1',
    { key, steamid: steamId, include_played_free_games: '1' }
  )
  return data.response.games ?? null
}

/** Private and empty wishlists look identical to the API, so both come back as []. */
export async function getWishlist(steamId: string, key: string): Promise<WishlistItem[]> {
  const data = await steamApi<{ response: { items?: WishlistItem[] } }>(
    'IWishlistService/GetWishlist/v1',
    { key, steamid: steamId }
  )
  return data.response.items ?? []
}

export async function findApp(input: string): Promise<{ appid: number; name: string } | null> {
  const appid = parseAppInput(input)
  if (appid !== null) {
    const response = await fetch(`${STORE}/api/appdetails?appids=${appid}&filters=basic`)
    if (!response.ok) throw new Error(`Steam appdetails failed: HTTP ${response.status}`)
    const data = (await response.json()) as Record<
      string,
      { success: boolean; data?: { name: string } }
    >
    const name = data[appid]?.data?.name
    return name ? { appid, name } : null
  }

  const params = new URLSearchParams({ term: input.trim(), l: 'english', cc: 'IE' })
  const response = await fetch(`${STORE}/api/storesearch/?${params}`)
  if (!response.ok) throw new Error(`Steam store search failed: HTTP ${response.status}`)
  const data = (await response.json()) as { items?: { id: number; name: string; type: string }[] }
  const hit = data.items?.find((item) => item.type === 'app')
  return hit ? { appid: hit.id, name: hit.name } : null
}
