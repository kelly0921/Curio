import { getCloudflareContext } from "@opennextjs/cloudflare";

export type CurioRateLimitStatus = "allowed" | "limited" | "unavailable";

export interface CurioRateLimitResult {
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  status: CurioRateLimitStatus;
}

interface RateLimitStatement {
  first<T>(): Promise<T | null>;
}

interface RateLimitDatabase {
  prepare(query: string): {
    bind(...values: (number | string)[]): RateLimitStatement;
  };
}

export async function consumeD1RateLimit(
  database: RateLimitDatabase,
  profileId: string,
  operation: string,
  limit: number,
  windowSeconds: number,
  now = Date.now(),
): Promise<CurioRateLimitResult> {
  const nowSeconds = Math.floor(now / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const resetAt = windowStart + windowSeconds;
  const row = await database.prepare(`
    INSERT INTO api_rate_limit (profile_id, operation, window_start, request_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (profile_id, operation, window_start)
    DO UPDATE SET request_count = api_rate_limit.request_count + 1
    RETURNING request_count
  `).bind(profileId, operation, windowStart).first<{ request_count: number }>();
  if (!row) throw new Error("CURIO_RATE_LIMIT_WRITE_FAILED");

  const count = row.request_count;
  return {
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: Math.max(1, resetAt - nowSeconds),
    status: count > limit ? "limited" : "allowed",
  };
}

export async function enforceCurioRateLimit(
  profileId: string,
  operation: string,
  limit: number,
  windowSeconds = 60 * 60,
): Promise<CurioRateLimitResult> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!env.CURIO_DB) throw new Error("CURIO_RATE_LIMIT_DATABASE_UNAVAILABLE");
    return await consumeD1RateLimit(env.CURIO_DB, profileId, operation, limit, windowSeconds);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const resetAt = Math.floor(Date.now() / 1000) + windowSeconds;
      return { count: 0, limit, remaining: limit, resetAt, retryAfterSeconds: windowSeconds, status: "allowed" };
    }
    console.error(JSON.stringify({
      event: "api_rate_limit_unavailable",
      operation,
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    const resetAt = Math.floor(Date.now() / 1000) + 60;
    return { count: 0, limit, remaining: 0, resetAt, retryAfterSeconds: 60, status: "unavailable" };
  }
}

export function rateLimitHeaders(result: CurioRateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetAt),
    ...(result.status === "limited" || result.status === "unavailable"
      ? { "Retry-After": String(result.retryAfterSeconds) }
      : {}),
  };
}
