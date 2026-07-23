CREATE TABLE IF NOT EXISTS site_visit_counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_visit_events (
  visitor_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS increment_site_visit_counter
AFTER INSERT ON site_visit_events
BEGIN
  INSERT INTO site_visit_counter (id, count, updated_at)
  VALUES (1, 1, NEW.created_at)
  ON CONFLICT(id) DO UPDATE SET
    count = count + 1,
    updated_at = excluded.updated_at;
END;

CREATE TABLE IF NOT EXISTS site_status_updates (
  id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guestbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'general',
  photo_id INTEGER,
  affiliation TEXT NOT NULL,
  name TEXT NOT NULL,
  body_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guestbook_entries_photo_id
ON guestbook_entries (photo_id, id);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_client_created
ON api_rate_limits (client_key, created_at);

DELETE FROM guestbook_entries
WHERE (affiliation = '노무현' AND name = '저는....살아있습니다')
   OR (affiliation = '동고몽' AND name = '간지럽다')
   OR (affiliation = '테스트' AND name = '테스트');
