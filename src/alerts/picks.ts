import { spacedFetch } from '../proposals/steam'
import { htmlToText } from '../utils/html-to-text'

// Steam store search: popular new releases with Online Co-op (category3=38), IE store.
// Undocumented but long-lived; the caller treats any failure as "no new picks".
const SEARCH_URL =
  'https://store.steampowered.com/search/results/?json=1&category1=998&category3=38' +
  '&filter=popularnew&sort_by=Released_DESC&cc=IE&l=english&count=25'
// Steam's review_score: 8 = Very Positive (≥80% of ≥50 reviews), 9 = Overwhelmingly Positive.
const VERY_POSITIVE = 8

export interface Pick {
  appid: number
  name: string
  rank: number
  reviews: string
}

/** The search returns no appids, only capsule image URLs that contain them. */
export function parseSearch(body: { items?: { name: string; logo: string }[] }) {
  return (body.items ?? []).flatMap((item) => {
    const appid = Number(/\/apps\/(\d+)\//.exec(item.logo)?.[1])
    return appid ? [{ appid, name: htmlToText(item.name, 200) }] : []
  })
}

/** Popular new co-op games that are Very Positive or better, in Steam's order. */
export async function fetchPicks(): Promise<Pick[]> {
  const found = parseSearch(await spacedFetch(SEARCH_URL, 'store search'))
  const picks: Pick[] = []
  for (const [rank, game] of found.entries()) {
    const { query_summary: summary } = await spacedFetch<{
      query_summary?: { review_score?: number; review_score_desc?: string }
    }>(
      `https://store.steampowered.com/appreviews/${game.appid}?json=1&language=all&purchase_type=all&num_per_page=0`,
      'reviews'
    )
    if ((summary?.review_score ?? 0) >= VERY_POSITIVE && summary?.review_score_desc) {
      picks.push({ ...game, rank, reviews: summary.review_score_desc })
    }
  }
  return picks
}
