-- Leaderboard runs
CREATE TABLE scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  wave       INTEGER NOT NULL,
  kills      INTEGER NOT NULL,
  seconds    INTEGER NOT NULL,
  accuracy   INTEGER NOT NULL,
  won        INTEGER NOT NULL DEFAULT 0,
  device     TEXT    NOT NULL DEFAULT 'desktop',
  version    TEXT    NOT NULL DEFAULT '',
  ip_hash    TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_scores_score ON scores (score DESC);
CREATE INDEX idx_scores_name  ON scores (lower(name));
CREATE INDEX idx_scores_ip    ON scores (ip_hash, created_at);

-- Anonymous gameplay telemetry (no names, no IP addresses)
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session    TEXT NOT NULL,
  type       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  device     TEXT NOT NULL DEFAULT 'desktop',
  country    TEXT NOT NULL DEFAULT '',
  version    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_type ON events (type, created_at);
CREATE INDEX idx_events_session ON events (session);
