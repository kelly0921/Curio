import { describe, expect, it } from "vitest";
import { MemoryLearningItemRepository } from "@/lib/data/memory-repository";
import type { KnowledgeResource } from "@/lib/domain";
import { recordResourceEngagement, saveForYouRecommendationFeedback } from "@/lib/knowledge/engagement";
import { buildActiveFollowThroughPlans, updateResourceFollowThrough } from "@/lib/knowledge/follow-through";

const profileId = "00000000-0000-4000-8000-000000000031";
const resourceId = "10000000-0000-4000-8000-000000000901";
const timestamp = "2026-08-19T12:00:00.000Z";

const watchlistResource: KnowledgeResource = {
  id: resourceId,
  profileId,
  resourceType: "watchlist",
  domain: "finance",
  intent: "track",
  canonicalTopic: "Optical transceiver beneficiaries",
  title: "U.S. optical transceiver beneficiaries",
  summary: "Companies to revisit as evidence changes.",
  entities: ["AOI", "Lumentum"],
  entries: [
    {
      id: "20000000-0000-4000-8000-000000000901",
      kind: "recommendation",
      heading: "AOI",
      detail: "Review demand and production evidence.",
      sourceItemIds: ["30000000-0000-4000-8000-000000000901"],
      research: null,
      researchedAt: null,
      status: "active",
      relatedEntryIds: [],
      deepDives: [],
    },
    {
      id: "20000000-0000-4000-8000-000000000902",
      kind: "recommendation",
      heading: "Lumentum",
      detail: "Review laser demand and valuation evidence.",
      sourceItemIds: ["30000000-0000-4000-8000-000000000901"],
      research: null,
      researchedAt: null,
      status: "active",
      relatedEntryIds: [],
      deepDives: [],
    },
  ],
  sourceItemIds: ["30000000-0000-4000-8000-000000000901"],
  coverSourceItemId: null,
  coverCapturedAt: null,
  contributions: [{
    sourceItemId: "30000000-0000-4000-8000-000000000901",
    disposition: "created",
    addedEntryIds: ["20000000-0000-4000-8000-000000000901", "20000000-0000-4000-8000-000000000902"],
    supportedEntryIds: [],
    updatedEntryIds: [],
    conflictingEntryIds: [],
    summary: "Created this watchlist.",
    decisionMode: "deterministic",
    decisionConfidence: 1,
    decisionReason: null,
    mergeModel: null,
    mergePromptVersion: null,
    createdAt: timestamp,
  }],
  lastResearchedAt: null,
  mergeModel: null,
  mergePromptVersion: null,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

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

  it("turns a resource into an intent-aware plan and remembers progress", async () => {
    const repository = new MemoryLearningItemRepository();
    const started = await updateResourceFollowThrough(
      profileId,
      watchlistResource,
      { action: "start" },
      repository,
      new Date(timestamp),
    );
    expect(started.plan).toEqual(expect.objectContaining({ kind: "watchlist", completedCount: 0, totalCount: 2 }));

    const progressed = await updateResourceFollowThrough(
      profileId,
      watchlistResource,
      { action: "toggle_entry", entryId: watchlistResource.entries[0].id, completed: true },
      repository,
      new Date("2026-08-19T12:05:00.000Z"),
    );
    expect(progressed.plan.completedCount).toBe(1);
    expect(buildActiveFollowThroughPlans([watchlistResource], [progressed.engagement])).toHaveLength(1);

    const completed = await updateResourceFollowThrough(
      profileId,
      watchlistResource,
      { action: "complete" },
      repository,
      new Date("2026-08-19T12:10:00.000Z"),
    );
    expect(completed.plan).toEqual(expect.objectContaining({ state: "completed", completedCount: 2 }));
    expect(buildActiveFollowThroughPlans([watchlistResource], [completed.engagement])).toEqual([]);
  });
});
