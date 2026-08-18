CREATE TABLE IF NOT EXISTS knowledge_resource (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('guide', 'glossary', 'playbook', 'watchlist')),
  domain TEXT NOT NULL,
  canonical_topic TEXT NOT NULL,
  title TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 1,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_resource_profile_updated_idx
  ON knowledge_resource (profile_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS knowledge_resource_topic_idx
  ON knowledge_resource (profile_id, canonical_topic);

CREATE INDEX IF NOT EXISTS knowledge_resource_domain_idx
  ON knowledge_resource (profile_id, domain, resource_type);
