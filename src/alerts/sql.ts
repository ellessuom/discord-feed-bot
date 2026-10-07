// SQL for the alerts job, kept apart from index.ts so sql.test.ts can run the
// exact same statements against SQLite. Batch writes take a JSON array in ?1.

export const MEMBERS = 'SELECT discord_id FROM members ORDER BY linked_at'

/** Most recently played first: buildLibrary keeps this order, and metaQueue scans in it. */
export const OWNED = `SELECT m.discord_id, o.appid, o.playtime_forever FROM owned_games o
  JOIN members m ON m.steam_id = o.steam_id
  ORDER BY o.playtime_2weeks DESC, o.playtime_forever DESC`

export const WISHLIST = `SELECT m.discord_id, w.appid FROM wishlist w
  JOIN members m ON m.steam_id = w.steam_id`

export const APP_META = `SELECT appid, name, coop, early_access, coming_soon, header_image,
  has_data, fetched_at FROM app_meta`

/** Per app: the latest recorded price, the lowest ever, and when tracking started. */
export const PRICE_HISTORY = `SELECT appid, MIN(final) AS lowest, MIN(ts) AS since,
  (SELECT l.final FROM price_changes l WHERE l.appid = p.appid ORDER BY l.ts DESC LIMIT 1) AS last
  FROM price_changes p GROUP BY appid`

/** ?1: ISO time 24 h ago. */
export const POSTED_SINCE = `SELECT count(*) AS n FROM alerts WHERE status = 'posted' AND created_at >= ?1`

/** ?1: JSON array of keys. */
export const EXISTING_ALERTS = `SELECT key, created_at FROM alerts
  WHERE key IN (SELECT value FROM json_each(?1))`

/** ?1: JSON array of alerts, ?2: status, ?3: ISO time. A re-posted sale refreshes its row. */
export const UPSERT_ALERTS = `INSERT INTO alerts (key, kind, appid, line, status, created_at)
  SELECT json_extract(value, '$.key'), json_extract(value, '$.kind'), json_extract(value, '$.appid'),
         json_extract(value, '$.line'), ?2, ?3
  FROM json_each(?1) WHERE true
  ON CONFLICT (key) DO UPDATE SET
    line = excluded.line, status = excluded.status, created_at = excluded.created_at`

/** ?1: JSON array of app_meta rows. */
export const UPSERT_META = `INSERT INTO app_meta
    (appid, name, coop, early_access, coming_soon, header_image, has_data, fetched_at)
  SELECT json_extract(value, '$.appid'), json_extract(value, '$.name'), json_extract(value, '$.coop'),
         json_extract(value, '$.early_access'), json_extract(value, '$.coming_soon'),
         json_extract(value, '$.header_image'), json_extract(value, '$.has_data'),
         json_extract(value, '$.fetched_at')
  FROM json_each(?1) WHERE true
  ON CONFLICT (appid) DO UPDATE SET
    name = excluded.name, coop = excluded.coop, early_access = excluded.early_access,
    coming_soon = excluded.coming_soon, header_image = excluded.header_image,
    has_data = excluded.has_data, fetched_at = excluded.fetched_at`

/** ?1: JSON array of {appid, final, initial, currency}, ?2: ISO time. */
export const INSERT_PRICES = `INSERT OR IGNORE INTO price_changes (appid, ts, final, initial, currency)
  SELECT json_extract(value, '$.appid'), ?2, json_extract(value, '$.final'),
         json_extract(value, '$.initial'), json_extract(value, '$.currency')
  FROM json_each(?1)`
