CREATE TABLE IF NOT EXISTS "api_rate_limit" (
  "profile_id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "window_start" INTEGER NOT NULL,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("profile_id", "operation", "window_start")
);

CREATE INDEX IF NOT EXISTS "api_rate_limit_window_start_idx"
  ON "api_rate_limit" ("window_start");
