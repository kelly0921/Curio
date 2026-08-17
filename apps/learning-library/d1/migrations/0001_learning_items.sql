CREATE TABLE IF NOT EXISTS learning_item (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  source_url TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'tiktok', 'vimeo', 'web', 'local', 'demo')),
  source_type TEXT NOT NULL CHECK (source_type IN ('uploaded_media', 'instagram_url', 'external_url', 'demo_fixture')),
  source_fingerprint TEXT NOT NULL UNIQUE,
  creator TEXT,
  processing_status TEXT NOT NULL,
  access_level TEXT NOT NULL,
  intent TEXT NOT NULL,
  generated_title TEXT,
  primary_topic TEXT,
  content_type TEXT,
  requires_verification INTEGER NOT NULL DEFAULT 0 CHECK (requires_verification IN (0, 1)),
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_item_profile_created_idx
  ON learning_item (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS learning_item_topic_idx
  ON learning_item (primary_topic);

CREATE INDEX IF NOT EXISTS learning_item_status_idx
  ON learning_item (processing_status);
