import { describe, expect, it } from "vitest";
import { consumeD1RateLimit } from "@/lib/api/rate-limit";

class FakeRateLimitDatabase {
  private readonly counts = new Map<string, number>();

  prepare(query: string) {
    expect(query).toContain("ON CONFLICT");
    return {
      bind: (profileId: string | number, operation: string | number, windowStart: string | number) => ({
        first: async <T>() => {
          const key = `${profileId}:${operation}:${windowStart}`;
          const request_count = (this.counts.get(key) ?? 0) + 1;
          this.counts.set(key, request_count);
          return { request_count } as T;
        },
      }),
    };
  }
}

describe("D1 API rate limits", () => {
  it("allows the configured budget and rejects the next request atomically", async () => {
    const database = new FakeRateLimitDatabase();
    const now = Date.UTC(2026, 8, 28, 12, 30);

    expect((await consumeD1RateLimit(database, "profile-1", "items:create", 2, 3_600, now)).status).toBe("allowed");
    const second = await consumeD1RateLimit(database, "profile-1", "items:create", 2, 3_600, now);
    expect(second).toMatchObject({ count: 2, remaining: 0, status: "allowed" });
    const third = await consumeD1RateLimit(database, "profile-1", "items:create", 2, 3_600, now);
    expect(third).toMatchObject({ count: 3, remaining: 0, status: "limited" });
    expect(third.retryAfterSeconds).toBe(1_800);
  });

  it("keeps operations, profiles, and windows independent", async () => {
    const database = new FakeRateLimitDatabase();
    const now = Date.UTC(2026, 8, 28, 12, 59, 59);
    await consumeD1RateLimit(database, "profile-1", "items:create", 1, 3_600, now);

    expect((await consumeD1RateLimit(database, "profile-1", "resources:refresh", 1, 3_600, now)).status).toBe("allowed");
    expect((await consumeD1RateLimit(database, "profile-2", "items:create", 1, 3_600, now)).status).toBe("allowed");
    expect((await consumeD1RateLimit(database, "profile-1", "items:create", 1, 3_600, now + 1_000)).status).toBe("allowed");
  });
});
