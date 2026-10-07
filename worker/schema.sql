-- Additive only: never DROP or rewrite tables once deployed (see AGENTS.md).

CREATE TABLE IF NOT EXISTS members (
  discord_id TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL UNIQUE,
  persona TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS owned_games (
  steam_id TEXT NOT NULL,
  appid INTEGER NOT NULL,
  playtime_forever INTEGER NOT NULL, -- minutes
  playtime_2weeks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (steam_id, appid)
);
CREATE INDEX IF NOT EXISTS owned_games_by_app ON owned_games (appid);

CREATE TABLE IF NOT EXISTS wishlist (
  steam_id TEXT NOT NULL,
  appid INTEGER NOT NULL,
  added_at INTEGER,
  PRIMARY KEY (steam_id, appid)
);
CREATE INDEX IF NOT EXISTS wishlist_by_app ON wishlist (appid);

-- Written by the hourly proposals job: the "Owned by" fields last shown on each
-- forum card, so a card is only edited when ownership changes.
CREATE TABLE IF NOT EXISTS proposal_owners (
  appid INTEGER PRIMARY KEY,
  rendered TEXT NOT NULL
);

-- Written every 2 min by the Worker cron, only for members in VOICE_OPT_IN who are
-- in voice. ts = unix seconds of the tick, shared by every row of that tick.
-- Purged after 400 days by the weekly wrap-up (see PRIVACY.md).
CREATE TABLE IF NOT EXISTS voice_samples (
  ts INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  appid INTEGER, -- Steam game they were in, when their profile shows it
  PRIMARY KEY (ts, discord_id)
);

-- Written by the hourly alerts job (src/alerts/). Steam store metadata only.
CREATE TABLE IF NOT EXISTS app_meta (
  appid INTEGER PRIMARY KEY,
  name TEXT,
  coop INTEGER NOT NULL DEFAULT 0,
  early_access INTEGER NOT NULL DEFAULT 0,
  coming_soon INTEGER NOT NULL DEFAULT 0,
  header_image TEXT,
  has_data INTEGER NOT NULL, -- 0 when Steam returned nothing usable (delisted, region-locked)
  fetched_at TEXT NOT NULL
);

-- Our own price history (IE store): one row each time an app's price changes.
CREATE TABLE IF NOT EXISTS price_changes (
  appid INTEGER NOT NULL,
  ts TEXT NOT NULL,
  final INTEGER NOT NULL, -- cents
  initial INTEGER NOT NULL,
  currency TEXT NOT NULL,
  PRIMARY KEY (appid, ts)
);

-- Every alert decision: posted, over the daily cap (listed in the wrap-up), or skipped.
-- `line` names the game only, never people, so /unlink leaves nothing behind here.
CREATE TABLE IF NOT EXISTS alerts (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  appid INTEGER,
  line TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_by_time ON alerts (created_at);

-- Written daily by the alerts job: Steam's popular new Online Co-op games rated Very
-- Positive or better (public store data only). /together suggests the ones nobody owns.
CREATE TABLE IF NOT EXISTS discover (
  appid INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL, -- position in Steam's list
  reviews TEXT NOT NULL, -- Steam's label, e.g. "Very Positive"
  seen_at TEXT NOT NULL
);
