-- Migration number: 0001 	 init
CREATE TABLE links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  notes      TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE clicks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id    INTEGER NOT NULL REFERENCES links(id),
  ts         INTEGER NOT NULL,
  is_bot     INTEGER NOT NULL DEFAULT 0,
  medium     TEXT NOT NULL DEFAULT 'direct',
  referrer   TEXT,
  ref_host   TEXT,
  country    TEXT,
  device     TEXT,
  os         TEXT,
  browser    TEXT,
  user_agent TEXT
);

CREATE INDEX idx_clicks_link_bot_ts ON clicks(link_id, is_bot, ts);
