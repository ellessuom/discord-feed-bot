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
