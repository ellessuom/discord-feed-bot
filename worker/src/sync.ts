import { getOwnedGames, getWishlist } from './steam'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Upserts only rows whose playtime changed and deletes only games that vanished,
 * so a daily sync of a 500-game library writes a handful of rows, not 1000
 * (the D1 free plan allows 100k row writes a day).
 * Returns null when the profile's game details aren't public.
 */
export async function syncMember(
  db: D1Database,
  steamId: string,
  key: string
): Promise<{ games: number; wishlist: number; playtimeHidden: boolean } | null> {
  const [owned, wishlist] = await Promise.all([
    getOwnedGames(steamId, key),
    getWishlist(steamId, key),
  ])
  if (owned === null) return null

  const games = JSON.stringify(
    owned.map((g) => ({ a: g.appid, p: g.playtime_forever, w: g.playtime_2weeks ?? 0 }))
  )
  const wished = JSON.stringify(wishlist.map((w) => ({ a: w.appid, d: w.date_added ?? null })))

  await db.batch([
    db
      .prepare(
        `INSERT INTO owned_games (steam_id, appid, playtime_forever, playtime_2weeks)
         SELECT ?1, json_extract(value, '$.a'), json_extract(value, '$.p'), json_extract(value, '$.w')
         FROM json_each(?2) WHERE true
         ON CONFLICT (steam_id, appid) DO UPDATE SET
           playtime_forever = excluded.playtime_forever,
           playtime_2weeks = excluded.playtime_2weeks
         WHERE playtime_forever != excluded.playtime_forever
            OR playtime_2weeks != excluded.playtime_2weeks`
      )
      .bind(steamId, games),
    db
      .prepare(
        `DELETE FROM owned_games WHERE steam_id = ?1
         AND appid NOT IN (SELECT json_extract(value, '$.a') FROM json_each(?2))`
      )
      .bind(steamId, games),
    db
      .prepare(
        `INSERT INTO wishlist (steam_id, appid, added_at)
         SELECT ?1, json_extract(value, '$.a'), json_extract(value, '$.d')
         FROM json_each(?2) WHERE true
         ON CONFLICT (steam_id, appid) DO NOTHING`
      )
      .bind(steamId, wished),
    db
      .prepare(
        `DELETE FROM wishlist WHERE steam_id = ?1
         AND appid NOT IN (SELECT json_extract(value, '$.a') FROM json_each(?2))`
      )
      .bind(steamId, wished),
    db
      .prepare('UPDATE members SET synced_at = ?2 WHERE steam_id = ?1')
      .bind(steamId, new Date().toISOString()),
  ])

  return {
    games: owned.length,
    wishlist: wishlist.length,
    // "Always keep my total playtime private" reports every game at 0 minutes.
    playtimeHidden: owned.length > 0 && owned.every((g) => g.playtime_forever === 0),
  }
}

/** Cron: refresh the one member whose library is stalest, if it's over a day old. */
export async function syncStalestMember(db: D1Database, key: string): Promise<void> {
  const cutoff = new Date(Date.now() - DAY_MS).toISOString()
  const member = await db
    .prepare(
      `SELECT steam_id FROM members WHERE synced_at IS NULL OR synced_at < ?1
       ORDER BY synced_at IS NOT NULL, synced_at LIMIT 1`
    )
    .bind(cutoff)
    .first<{ steam_id: string }>()
  if (!member) return

  const result = await syncMember(db, member.steam_id, key)
  if (result === null) {
    // Went private since linking: keep the old data, stop retrying until tomorrow.
    await db
      .prepare('UPDATE members SET synced_at = ?2 WHERE steam_id = ?1')
      .bind(member.steam_id, new Date().toISOString())
      .run()
    console.warn(`Sync skipped: game details for ${member.steam_id} are no longer public`)
  }
}
