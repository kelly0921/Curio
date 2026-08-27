import { describe, expect, it } from "vitest";
import { MemoryLearningItemRepository } from "@/lib/data/memory-repository";
import type { ContextSnapshot, KnowledgeResource, ResourceEngagement } from "@/lib/domain";
import { recordResourceEngagement, saveForYouRecommendationFeedback } from "@/lib/knowledge/engagement";
import { buildActiveFollowThroughPlans, buildFollowThroughPlan, followThroughKindFor, updateResourceFollowThrough } from "@/lib/knowledge/follow-through";

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

function researchedWatchlist(patch: Partial<KnowledgeResource> = {}): KnowledgeResource {
  return {
    ...watchlistResource,
    lastResearchedAt: "2026-08-01T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...patch,
  };
}

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

    const checked = await updateResourceFollowThrough(
      profileId,
      watchlistResource,
      { action: "toggle_entry", entryId: watchlistResource.entries[1].id, completed: true },
      repository,
      new Date("2026-08-19T12:07:00.000Z"),
    );
    expect(checked.plan).toEqual(expect.objectContaining({
      attention: "now",
      completedCount: 2,
      whyNow: expect.stringContaining("Everything is checked off"),
    }));

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

  it("does not turn informational resources or legacy review rows into user tasks", async () => {
    const repository = new MemoryLearningItemRepository();
    const informational = {
      ...watchlistResource,
      resourceType: "guide" as const,
      intent: "understand" as const,
      title: "Optical transceivers explained",
    };
    expect(followThroughKindFor(informational)).toBeNull();
    await expect(updateResourceFollowThrough(
      profileId,
      informational,
      { action: "start" },
      repository,
      new Date(timestamp),
    )).rejects.toThrow("FOLLOW_THROUGH_NOT_ACTIONABLE");
    expect(await repository.listResourceEngagement(profileId)).toEqual([]);

    const legacy: ResourceEngagement = {
      profileId,
      resourceId,
      openCount: 0,
      expandedCount: 0,
      sourceOpenCount: 0,
      deepDiveCount: 0,
      lastOpenedAt: null,
      lastExpandedAt: null,
      lastSourceOpenedAt: null,
      lastDeepDiveAt: null,
      followThrough: {
        kind: "review",
        state: "active",
        completedEntryIds: [],
        startedAt: timestamp,
        completedAt: null,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    };
    expect(buildFollowThroughPlan(informational, legacy)).toBeNull();
    expect(buildActiveFollowThroughPlans([informational], [legacy])).toEqual([]);
  });

  it("resurfaces active plans only when evidence, timing, or real context makes them relevant", async () => {
    const repository = new MemoryLearningItemRepository();
    const resource = researchedWatchlist();
    const started = await updateResourceFollowThrough(
      profileId,
      resource,
      { action: "start" },
      repository,
      new Date("2026-08-01T12:00:00.000Z"),
    );

    const onTrack = buildFollowThroughPlan(resource, started.engagement, null, new Date("2026-08-04T12:00:00.000Z"));
    expect(onTrack).toEqual(expect.objectContaining({
      attention: "on_track",
      nextReviewAt: "2026-08-08T12:00:00.000Z",
    }));

    const soon = buildFollowThroughPlan(resource, started.engagement, null, new Date("2026-08-06T12:00:00.000Z"));
    expect(soon).toEqual(expect.objectContaining({
      attention: "soon",
      whyNow: expect.stringContaining("soon"),
    }));

    const due = buildFollowThroughPlan(resource, started.engagement, null, new Date("2026-08-08T12:00:00.000Z"));
    expect(due).toEqual(expect.objectContaining({
      attention: "now",
      whyNow: expect.stringContaining("recheck the evidence"),
    }));

    const changed = buildFollowThroughPlan(
      { ...resource, updatedAt: "2026-08-04T13:00:00.000Z" },
      started.engagement,
      null,
      new Date("2026-08-04T13:05:00.000Z"),
    );
    expect(changed).toEqual(expect.objectContaining({
      attention: "now",
      whyNow: expect.stringContaining("gained new information"),
    }));

    const connectionId = "40000000-0000-4000-8000-000000000901";
    const context: ContextSnapshot = {
      profileId,
      connections: [{
        id: connectionId,
        profileId,
        provider: "notion",
        displayName: "Notion",
        status: "connected",
        scopes: ["read_content"],
        isDemo: false,
        lastSyncedAt: "2026-08-04T10:00:00.000Z",
        createdAt: "2026-08-01T10:00:00.000Z",
      }],
      records: [{
        id: "50000000-0000-4000-8000-000000000901",
        profileId,
        connectionId,
        domain: "finance",
        kind: "goal",
        statement: "Track the infrastructure behind AI demand.",
        keywords: ["optical transceiver"],
        sourceLabel: "Investing goals",
        sourceReference: null,
        sensitivity: "private",
        confidence: "imported",
        observedAt: "2026-08-04T10:00:00.000Z",
        expiresAt: null,
      }],
      syncedAt: "2026-08-04T10:00:00.000Z",
    };
    const contextMatched = buildFollowThroughPlan(resource, started.engagement, context, new Date("2026-08-04T12:00:00.000Z"));
    expect(contextMatched).toEqual(expect.objectContaining({
      attention: "now",
      whyNow: "This matches a current priority from your connected context.",
    }));
  });

  it("sorts plans needing attention ahead of plans that are still on track", async () => {
    const repository = new MemoryLearningItemRepository();
    const stable = researchedWatchlist({
      id: "10000000-0000-4000-8000-000000000902",
      title: "Stable optical infrastructure notes",
    });
    const changing = researchedWatchlist();
    const stableStarted = await updateResourceFollowThrough(
      profileId,
      stable,
      { action: "start" },
      repository,
      new Date("2026-08-01T12:00:00.000Z"),
    );
    const changingStarted = await updateResourceFollowThrough(
      profileId,
      changing,
      { action: "start" },
      repository,
      new Date("2026-08-01T12:00:00.000Z"),
    );
    const changedResource = { ...changing, updatedAt: "2026-08-04T13:00:00.000Z" };

    const plans = buildActiveFollowThroughPlans(
      [stable, changedResource],
      [stableStarted.engagement, changingStarted.engagement],
      null,
      new Date("2026-08-04T13:05:00.000Z"),
    );
    expect(plans.map((plan) => [plan.resourceId, plan.attention])).toEqual([
      [changing.id, "now"],
      [stable.id, "on_track"],
    ]);
  });
});
