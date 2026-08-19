import { describe, expect, it } from "vitest";
import { MemoryLearningItemRepository } from "@/lib/data/memory-repository";
import { recordResourceEngagement, saveForYouRecommendationFeedback } from "@/lib/knowledge/engagement";

const profileId = "00000000-0000-4000-8000-000000000031";
const resourceId = "10000000-0000-4000-8000-000000000901";

describe("For You engagement", () => {
  it("accumulates resource signals without modifying knowledge resources", async () => {
    const repository = new MemoryLearningItemRepository();
    await recordResourceEngagement(profileId, resourceId, "opened", repository, new Date("2026-08-19T10:00:00.000Z"));
    await recordResourceEngagement(profileId, resourceId, "expanded", repository, new Date("2026-08-19T10:05:00.000Z"));
    const saved = await recordResourceEngagement(profileId, resourceId, "deep_dive", repository, new Date("2026-08-19T10:10:00.000Z"));

    expect(saved).toEqual(expect.objectContaining({
      openCount: 1,
      expandedCount: 1,
      deepDiveCount: 1,
      lastOpenedAt: "2026-08-19T10:00:00.000Z",
      lastExpandedAt: "2026-08-19T10:05:00.000Z",
      lastDeepDiveAt: "2026-08-19T10:10:00.000Z",
    }));
    expect(await repository.listResourceEngagement(profileId)).toEqual([saved]);
  });

  it("sets a seven-day reminder while Done stays final for that recommendation", async () => {
    const repository = new MemoryLearningItemRepository();
    const later = await saveForYouRecommendationFeedback({
      profileId,
      recommendationId: "for-you:use-now:test",
      resourceId,
      lane: "use_now",
      action: "later",
    }, repository, new Date("2026-08-19T12:00:00.000Z"));
    expect(later.revisitAt).toBe("2026-08-26T12:00:00.000Z");

    const done = await saveForYouRecommendationFeedback({
      profileId,
      recommendationId: "for-you:learn-next:test",
      resourceId,
      lane: "learn_next",
      action: "done",
    }, repository, new Date("2026-08-19T12:05:00.000Z"));
    expect(done.revisitAt).toBeNull();
    expect((await repository.listForYouFeedback(profileId)).map((feedback) => feedback.state).sort()).toEqual(["done", "later"]);
  });
});
