import { describe, expect, it } from "vitest";
import { MemoryLearningItemRepository } from "@/lib/data/memory-repository";
import { knowledgeResourceSchema, learningItemSchema } from "@/lib/domain";

const profileA = "10000000-0000-4000-8000-000000000001";
const profileB = "20000000-0000-4000-8000-000000000002";
const itemAId = "30000000-0000-4000-8000-000000000001";
const itemBId = "40000000-0000-4000-8000-000000000002";
const resourceAId = "50000000-0000-4000-8000-000000000001";
const timestamp = "2026-08-20T16:00:00.000Z";

function item(profileId: string, id: string) {
  return learningItemSchema.parse({
    id,
    profileId,
    sourceType: "external_url",
    sourceUrl: "https://example.com/shared-learning",
    platform: "web",
    creator: null,
    sourceCaption: null,
    transcript: null,
    extractedVisualText: null,
    uploadedMediaReference: null,
    sourceVisual: null,
    sourceFingerprint: "same-canonical-fingerprint",
    accessLevel: "link_only",
    processingStatus: "partial",
    intent: "remember",
    sourceMaterials: [],
    card: null,
    analysisMode: "not_run",
    analysisModel: null,
    analysisPromptVersion: null,
    sourceRetrievalVersion: null,
    transcriptionModel: null,
    issues: [],
    resourceIds: [],
    inferredIntent: null,
    recommendationFeedback: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

describe("multi-user repository isolation", () => {
  it("keeps identical sources and direct lookups private to each profile", async () => {
    const repository = new MemoryLearningItemRepository();
    const itemA = await repository.save(item(profileA, itemAId));
    const itemB = await repository.save(item(profileB, itemBId));

    expect(await repository.list(profileA)).toEqual([itemA]);
    expect(await repository.list(profileB)).toEqual([itemB]);
    expect(await repository.findById(profileB, itemA.id)).toBeNull();
    expect(await repository.findByFingerprint(profileA, itemA.sourceFingerprint)).toEqual(itemA);
    expect(await repository.findByFingerprint(profileB, itemB.sourceFingerprint)).toEqual(itemB);

    const resourceA = knowledgeResourceSchema.parse({
      id: resourceAId,
      profileId: profileA,
      resourceType: "guide",
      domain: "general",
      intent: "understand",
      canonicalTopic: "shared learning",
      title: "A private learning guide",
      summary: "Only profile A should be able to load this resource.",
      entities: [],
      entries: [{
        id: "60000000-0000-4000-8000-000000000001",
        kind: "insight",
        heading: null,
        detail: "Keep every resource lookup scoped to its authenticated viewer.",
        sourceItemIds: [itemAId],
        research: null,
        researchedAt: null,
        status: "active",
        relatedEntryIds: [],
        deepDives: [],
      }],
      sourceItemIds: [itemAId],
      coverSourceItemId: null,
      coverCapturedAt: null,
      contributions: [{
        sourceItemId: itemAId,
        disposition: "created",
        addedEntryIds: ["60000000-0000-4000-8000-000000000001"],
        supportedEntryIds: [],
        updatedEntryIds: [],
        conflictingEntryIds: [],
        summary: "Created this private guide.",
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
    });
    await repository.saveResource(resourceA);

    expect(await repository.findResourceById(profileA, resourceAId)).toEqual(resourceA);
    expect(await repository.findResourceById(profileB, resourceAId)).toBeNull();
  });
});
