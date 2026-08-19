CREATE TABLE IF NOT EXISTS resource_engagement (
  profile_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, resource_id)
);

CREATE INDEX IF NOT EXISTS resource_engagement_profile_updated_idx
  ON resource_engagement (profile_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS for_you_feedback (
  profile_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('learn_next', 'use_now', 'worth_revisiting')),
  state TEXT NOT NULL CHECK (state IN ('done', 'later', 'not_relevant')),
  revisit_at TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, recommendation_id)
);

CREATE INDEX IF NOT EXISTS for_you_feedback_profile_updated_idx
  ON for_you_feedback (profile_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS for_you_feedback_resource_idx
  ON for_you_feedback (profile_id, resource_id);
