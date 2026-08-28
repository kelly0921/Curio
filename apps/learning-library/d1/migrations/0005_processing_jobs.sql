CREATE TABLE IF NOT EXISTS processing_job (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  item_id TEXT,
  resource_id TEXT,
  error_code TEXT,
  error_message TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE (profile_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS processing_job_profile_created_idx
  ON processing_job (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS processing_job_status_updated_idx
  ON processing_job (status, updated_at);
