import { withRetry } from '../utils/retry'
import { toHttpError } from '../utils/http-error'

const APPDETAILS_URL = 'https://store.steampowered.com/api/appdetails'

/**
 * Verified against the live API:
 *   appids=730,570                          -> HTTP 400
 *   appids=730,570&filters=price_overview   -> OK
 *   appids=730&filters=name,price_overview  -> unusable
 * So batching is only legal with the single `price_overview` filter. Fetching
 * name/genres/images must be one appid per request.
 */
const PRICE_BATCH_SIZE = 20

/** Steam's undocumented limit is ~200 requests / 5 min per IP, and Actions runners share IPs. */
const REQUEST_SPACING_MS = 400

export interface SteamPrice {
  currency: string
  initial: number
  final: number
  discount_percent: number
}

export interface SteamAppDetails {
  name: string
  type: string
  isFree: boolean
  comingSoon: boolean
  headerImage?: string | undefined
  shortDescription?: string | undefined
  categories: string[]
  genres: string[]
  price?: SteamPrice | undefined
}

export type SteamLookup =
  | { state: 'ok'; details: SteamAppDetails }
  | { state: 'unavailable' } // success:true but data:[] — free-to-play, unreleased, or no price
  | { state: 'failed' } // success:false — delisted, region-locked, or not an app

interface RawEntry {
  success?: boolean
  data?: unknown
}

let lastRequestAt = 0

async function spacedFetch<T>(url: string, operation: string): Promise<T> {
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < REQUEST_SPACING_MS) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_SPACING_MS - elapsed))
  }

  try {
    return await withRetry(
      async () => {
        const response = await fetch(url)
        if (!response.ok) {
          throw await toHttpError(response)
        }
        const text = await response.text()
        // A multi-filter request returns a bare `null` body rather than an object.
        if (!text || text === 'null') {
          throw new Error('Steam returned a null body')
        }
        return JSON.parse(text) as T
      },
      // Steam's 429 carries no Retry-After, so this is blind backoff by necessity.
      { retries: 3, baseDelayMs: 2000, maxDelayMs: 30000 },
      { operation }
    )
  } finally {
    lastRequestAt = Date.now()
  }
}

function isPopulatedObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readEntry(raw: Record<string, RawEntry | undefined>, appid: number): SteamLookup {
  const entry = raw[String(appid)]
  if (!entry || entry.success !== true) {
    return { state: 'failed' }
  }
  // `data: []` is Steam's way of saying "nothing to show" — free-to-play games,
  // unreleased titles, and anything without a price_overview all land here.
  if (!isPopulatedObject(entry.data)) {
    return { state: 'unavailable' }
  }
  return { state: 'ok', details: parseDetails(entry.data) }
}

function parseDetails(data: Record<string, unknown>): SteamAppDetails {
  const categories = Array.isArray(data.categories)
    ? data.categories
        .map((c) => (isPopulatedObject(c) ? String(c.description ?? '') : ''))
        .filter(Boolean)
    : []
  const genres = Array.isArray(data.genres)
    ? data.genres
        .map((g) => (isPopulatedObject(g) ? String(g.description ?? '') : ''))
        .filter(Boolean)
    : []

  const releaseDate = isPopulatedObject(data.release_date) ? data.release_date : undefined
  const rawPrice = isPopulatedObject(data.price_overview) ? data.price_overview : undefined

  const details: SteamAppDetails = {
    name: typeof data.name === 'string' ? data.name : 'Unknown',
    type: typeof data.type === 'string' ? data.type : 'game',
    isFree: data.is_free === true,
    comingSoon: releaseDate?.coming_soon === true,
    categories,
    genres,
  }

  if (typeof data.header_image === 'string') details.headerImage = data.header_image
  if (typeof data.short_description === 'string') details.shortDescription = data.short_description
  if (rawPrice) {
    details.price = {
      currency: String(rawPrice.currency ?? ''),
      initial: Number(rawPrice.initial ?? 0),
      final: Number(rawPrice.final ?? 0),
      discount_percent: Number(rawPrice.discount_percent ?? 0),
    }
  }

  return details
}

export interface SteamRegion {
  cc: string
  lang: string
}

/** Full metadata for one app. Cannot be batched — see PRICE_BATCH_SIZE note. */
export async function fetchAppDetails(appid: number, region: SteamRegion): Promise<SteamLookup> {
  const url = `${APPDETAILS_URL}?appids=${appid}&cc=${region.cc}&l=${region.lang}`
  const raw = await spacedFetch<Record<string, RawEntry | undefined>>(url, `appdetails(${appid})`)
  return readEntry(raw, appid)
}

/** Prices only, batched. The single `price_overview` filter is what makes batching legal. */
export async function fetchPrices(
  appids: number[],
  region: SteamRegion
): Promise<Map<number, SteamPrice | null>> {
  const out = new Map<number, SteamPrice | null>()

  for (let i = 0; i < appids.length; i += PRICE_BATCH_SIZE) {
    const batch = appids.slice(i, i + PRICE_BATCH_SIZE)
    const url = `${APPDETAILS_URL}?appids=${batch.join(',')}&filters=price_overview&cc=${region.cc}`
    const raw = await spacedFetch<Record<string, RawEntry | undefined>>(
      url,
      `prices(${batch.length} apps)`
    )

    for (const appid of batch) {
      const lookup = readEntry(raw, appid)
      if (lookup.state === 'ok' && lookup.details.price) {
        out.set(appid, lookup.details.price)
      } else {
        out.set(appid, null)
      }
    }
  }

  return out
}
