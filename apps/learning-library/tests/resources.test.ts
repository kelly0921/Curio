import { describe, expect, it } from "vitest";
import { learningItemSchema, type LearningCard, type LearningItem } from "@/lib/domain";
import { MemoryLearningItemRepository } from "@/lib/data/memory-repository";
import type { KnowledgeResourceMerger } from "@/lib/ai/services";
import {
  inferKnowledgeResourceType,
  inferResourceDomain,
  inferSaveIntent,
  inferSaveIntentWithConfidence,
  synchronizeKnowledgeResources,
  upsertKnowledgeResourceForItem,
} from "@/lib/knowledge/resources";

const profileId = "00000000-0000-4000-8000-000000000031";

function card(patch: Partial<LearningCard> = {}): LearningCard {
  return {
    title: "Five Japan trip upgrades",
    primaryTopic: "Travel preparation for Japan",
    secondaryTopics: ["Japan", "transportation"],
    domain: "general",
    presentationType: "named_list",
    contentType: "resource_recommendation",
    summary: "Useful preparation ideas for a trip to Japan.",
    keyTakeaways: [
      "Suica — Add a transit card to your phone before arrival.",
      "Luggage forwarding — Send larger bags between hotels.",
    ],
    relevanceReason: "Useful for a future trip.",
    suggestedAction: "Review before departure.",
    claimsToVerify: [],
    notes: [],
    researchBrief: null,
    personalization: null,
    ...patch,
  };
}

function item(id: string, createdAt: string, sourceCard: LearningCard): LearningItem {
  return learningItemSchema.parse({
    id,
    profileId,
    sourceType: "external_url",
    sourceUrl: `https://example.com/${id}`,
    platform: "instagram",
    creator: "@creator",
    sourceCaption: "Useful source text.",
    transcript: null,
    extractedVisualText: null,
    uploadedMediaReference: null,
    sourceFingerprint: `fingerprint-${id}`,
    accessLevel: "partial",
    processingStatus: "partial",
    intent: "remember",
    sourceMaterials: [{
      kind: "caption",
      label: "Caption",
      text: "Useful source text.",
      origin: "user_supplied",
      completeness: "partial",
    }],
    card: sourceCard,
    analysisMode: "live_openai",
    analysisModel: "test",
    analysisPromptVersion: "test-v1",
    sourceRetrievalVersion: null,
    transcriptionModel: null,
    issues: [],
    createdAt,
    updatedAt: createdAt,
  });
}

describe("Living resources", () => {
  it("infers useful resource structures and repairs obvious legacy domains", () => {
    expect(inferKnowledgeResourceType(card())).toBe("guide");
    expect(inferResourceDomain(card())).toBe("travel");
    expect(inferKnowledgeResourceType(card({
      title: "Three finance terms explained plainly",
      primaryTopic: "finance terms",
      domain: "finance",
    }))).toBe("glossary");
    expect(inferKnowledgeResourceType(card({
      title: "U.S. optical transceiver beneficiaries",
      primaryTopic: "optical transceiver stocks",
      domain: "finance",
    }))).toBe("watchlist");
    expect(inferKnowledgeResourceType(card({
      title: "Use actors for content audits",
      primaryTopic: "content audits",
      domain: "ai_work",
      presentationType: "how_to",
      contentType: "tutorial",
    }))).toBe("playbook");
    expect(inferSaveIntent(card())).toBe("visit");
    expect(inferSaveIntent(card({ presentationType: "comparison" }))).toBe("compare");
    expect(inferSaveIntent(card({ presentationType: "how_to", contentType: "tutorial" }))).toBe("try");
    expect(inferSaveIntent(card({
      title: "U.S. optical transceiver beneficiaries",
      primaryTopic: "optical transceiver stocks",
      domain: "finance",
    }))).toBe("track");
    expect(inferSaveIntent(card({
      title: "Three finance terms in plain English",
      primaryTopic: "finance terms",
      domain: "finance",
      presentationType: "named_list",
      contentType: "tutorial",
      suggestedAction: "Use these definitions to decode finance articles.",
    }))).toBe("understand");
    expect(inferSaveIntent(card({
      title: "Infinite banking basics and limits",
      primaryTopic: "Infinite banking",
      domain: "finance",
      presentationType: "explainer",
      contentType: "factual_information",
      summary: "An explanation of a high-cash-value whole life policy and its tradeoffs.",
      suggestedAction: "Compare this structure with a fee-only planner's explanation.",
      keyTakeaways: ["The setup is costly and may take five to eight years to break even."],
    }))).toBe("understand");
    expect(inferSaveIntent(card({
      presentationType: "explainer",
      contentType: "tactic",
    }))).toBe("visit");
    expect(inferSaveIntent(card({
      title: "The best carry-on chargers compared",
      primaryTopic: "portable chargers",
      domain: "general",
      presentationType: "recommendation",
      summary: "A side-by-side comparison before you buy a travel charger.",
    }))).toBe("compare");
    expect(inferSaveIntentWithConfidence(card({
      title: "Use actors for content audits",
      primaryTopic: "content audits",
      domain: "ai_work",
      presentationType: "how_to",
      contentType: "tutorial",
    })).confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("repairs obvious legacy default intents without making the resource look newly updated", async () => {
    const repository = new MemoryLearningItemRepository();
    const source = item("10000000-0000-4000-8000-000000000051", "2026-08-18T10:00:00.000Z", card());
    await repository.save(source);
    const created = await upsertKnowledgeResourceForItem(source, repository, {
      now: () => "2026-08-18T12:00:00.000Z",
    });
    expect(created?.resource.intent).toBe("visit");
    await repository.saveResource({ ...created!.resource, intent: "understand" });
    await repository.save({ ...created!.item, inferredIntent: "understand" });

    const currentItem = await repository.findById(source.id);
    const repaired = await synchronizeKnowledgeResources([currentItem!], repository);
    const savedItem = await repository.findById(source.id);

    expect(repaired[0].intent).toBe("visit");
    expect(repaired[0].updatedAt).toBe("2026-08-18T12:00:00.000Z");
    expect(repaired[0].contributions).toEqual(created?.resource.contributions);
    expect(savedItem?.inferredIntent).toBe("visit");
  });

  it("uses an available source frame as the stable resource cover", async () => {
    const repository = new MemoryLearningItemRepository();
    const source = learningItemSchema.parse({
      ...item("10000000-0000-4000-8000-000000000052", "2026-08-18T10:00:00.000Z", card()),
      sourceVisual: {
        kind: "reel_frame",
        objectKey: "profiles/profile/items/item/cover.jpg",
        mimeType: "image/jpeg",
        timestampSeconds: 1.5,
        capturedAt: "2026-08-18T10:01:00.000Z",
      },
    });
    await repository.save(source);

    const created = await upsertKnowledgeResourceForItem(source, repository);

    expect(created?.resource.coverSourceItemId).toBe(source.id);
  });

  it("repairs a stale specific intent when the source shape does not support it", async () => {
    const repository = new MemoryLearningItemRepository();
    const source = item("10000000-0000-4000-8000-000000000052", "2026-08-18T10:00:00.000Z", card({
      title: "Use actors for content audits",
      primaryTopic: "content audits",
      domain: "ai_work",
      presentationType: "how_to",
      contentType: "tutorial",
    }));
    await repository.save(source);
    const created = await upsertKnowledgeResourceForItem(source, repository);
    await repository.saveResource({ ...created!.resource, intent: "reference" });

    const synchronized = await synchronizeKnowledgeResources([created!.item], repository);

    expect(synchronized[0].intent).toBe("try");
  });

  it("merges related sources, removes repeated notes, and retains entry provenance", async () => {
    const repository = new MemoryLearningItemRepository();
    const first = item("10000000-0000-4000-8000-000000000001", "2026-08-18T10:00:00.000Z", card());
    const second = item("10000000-0000-4000-8000-000000000002", "2026-08-18T11:00:00.000Z", card({
      title: "Japan travel tips worth saving",
      primaryTopic: "Japan travel planning",
      keyTakeaways: [
        "Suica — Set up the digital transit card before the flight.",
        "Visit timing — Arrive at popular places early in the morning.",
      ],
    }));
    await repository.save(first);
    await repository.save(second);

    const created = await upsertKnowledgeResourceForItem(first, repository, {
      now: () => "2026-08-18T12:00:00.000Z",
    });
    const enriched = await upsertKnowledgeResourceForItem(second, repository, {
      now: () => "2026-08-18T13:00:00.000Z",
    });

    expect(created?.contribution.disposition).toBe("created");
    expect(enriched?.resource.id).toBe(created?.resource.id);
    expect(enriched?.contribution.disposition).toBe("enriched");
    expect(enriched?.contribution.addedEntryIds).toHaveLength(1);
    expect(enriched?.contribution.supportedEntryIds).toHaveLength(1);
    expect(enriched?.resource.entries).toHaveLength(3);
    expect(enriched?.resource.sourceItemIds).toEqual([first.id, second.id]);
    expect(enriched?.resource.entries.find((entry) => entry.heading === "Suica")?.sourceItemIds).toEqual([first.id, second.id]);
    expect(enriched?.item.resourceIds).toEqual([created?.resource.id]);
  });

  it("refreshes a source contribution without duplicating its entries", async () => {
    const repository = new MemoryLearningItemRepository();
    const source = item("10000000-0000-4000-8000-000000000003", "2026-08-18T10:00:00.000Z", card());
    await repository.save(source);
    const created = await upsertKnowledgeResourceForItem(source, repository);
    const refreshed = await upsertKnowledgeResourceForItem({
      ...source,
      card: card({ keyTakeaways: ["Suica — Add the transit card before arrival."] }),
    }, repository);

    expect(refreshed?.resource.id).toBe(created?.resource.id);
    expect(refreshed?.contribution.disposition).toBe("updated");
    expect(refreshed?.resource.entries).toHaveLength(1);
    expect(refreshed?.resource.sourceItemIds).toEqual([source.id]);
  });

  it("uses an AI decision to merge the same durable subject despite different wording", async () => {
    const repository = new MemoryLearningItemRepository();
    const first = item("10000000-0000-4000-8000-000000000011", "2026-08-18T10:00:00.000Z", card({
      title: "How an HSA works",
      primaryTopic: "health savings accounts",
      secondaryTopics: ["tax benefits"],
      domain: "finance",
      presentationType: "explainer",
      contentType: "factual_information",
      keyTakeaways: ["Triple tax benefit — Eligible contributions, growth, and qualified withdrawals can receive tax advantages."],
    }));
    const second = item("10000000-0000-4000-8000-000000000012", "2026-08-18T11:00:00.000Z", card({
      title: "A powerful medical investing account",
      primaryTopic: "medical expense investing vehicle",
      secondaryTopics: ["long-term savings"],
      domain: "finance",
      presentationType: "explainer",
      contentType: "factual_information",
      keyTakeaways: ["Keep receipts — Qualified expenses may be reimbursed later when records are retained."],
    }));
    await repository.save(first);
    await repository.save(second);
    const created = await upsertKnowledgeResourceForItem(first, repository);
    expect(created?.resource.resourceType).toBe(inferKnowledgeResourceType(second.card!));
    expect(created?.resource.domain).toBe(inferResourceDomain(second.card!));
    let candidateIds: string[] = [];
    const merger: KnowledgeResourceMerger = {
      async decide({ candidates }) {
        candidateIds = candidates.map((candidate) => candidate.id);
        return {
          matchDecision: "merge",
          matchedResourceId: candidates[0].id,
          confidence: 0.94,
          reason: "Both cards explain how an HSA can be used for medical costs and long-term savings.",
          inferredIntent: "understand",
          synthesizedTitle: "How to use an HSA",
          synthesizedSummary: "A practical guide to HSA tax treatment, eligible medical spending, and recordkeeping.",
          pointDecisions: [{ incomingIndex: 0, action: "new", existingEntryId: null, reason: "This adds a distinct recordkeeping tactic." }],
          model: "test-merge-model",
          promptVersion: "test-merge-v1",
        };
      },
    };
    const merged = await upsertKnowledgeResourceForItem(second, repository, { merger });

    expect(candidateIds).toContain(created?.resource.id);
    expect(merged?.resource.id).toBe(created?.resource.id);
    expect(merged?.resource.title).toBe("How to use an HSA");
    expect(merged?.resource.entries).toHaveLength(2);
    expect(merged?.contribution.decisionMode).toBe("ai");
    expect(merged?.contribution.decisionConfidence).toBe(0.94);
    expect(merged?.item.inferredIntent).toBe("understand");
  });

  it("keeps conflicting points visible and linked instead of silently choosing one", async () => {
    const repository = new MemoryLearningItemRepository();
    const first = item("10000000-0000-4000-8000-000000000021", "2026-08-18T10:00:00.000Z", card({
      title: "HSA contribution timing",
      primaryTopic: "HSA contribution timing",
      domain: "finance",
      presentationType: "explainer",
      contentType: "factual_information",
      keyTakeaways: ["Contribution deadline — Contributions can be made through the applicable tax deadline."],
    }));
    const second = item("10000000-0000-4000-8000-000000000022", "2026-08-18T11:00:00.000Z", card({
      title: "HSA deadline rule",
      primaryTopic: "HSA contribution timing",
      domain: "finance",
      presentationType: "explainer",
      contentType: "factual_information",
      keyTakeaways: ["Contribution deadline — Contributions must always be completed by December 31."],
    }));
    await repository.save(first);
    await repository.save(second);
    const created = await upsertKnowledgeResourceForItem(first, repository);
    const existingEntryId = created?.resource.entries[0].id as string;
    const merger: KnowledgeResourceMerger = {
      async decide({ candidates }) {
        return {
          matchDecision: "merge",
          matchedResourceId: candidates[0].id,
          confidence: 0.98,
          reason: "The sources address the same deadline but make incompatible claims.",
          inferredIntent: "understand",
          synthesizedTitle: "HSA contribution timing",
          synthesizedSummary: "A guide to contribution timing rules with source disagreements kept visible.",
          pointDecisions: [{ incomingIndex: 0, action: "conflicts", existingEntryId, reason: "The stated deadlines are incompatible." }],
          model: "test-merge-model",
          promptVersion: "test-merge-v1",
        };
      },
    };
    const merged = await upsertKnowledgeResourceForItem(second, repository, { merger });

    expect(merged?.contribution.disposition).toBe("conflict");
    expect(merged?.contribution.conflictingEntryIds).toHaveLength(1);
    expect(merged?.resource.entries).toHaveLength(2);
    expect(merged?.resource.entries.every((entry) => entry.status === "contested")).toBe(true);
    expect(merged?.resource.entries[0].relatedEntryIds).toEqual([merged?.resource.entries[1].id]);
    expect(merged?.resource.entries[1].relatedEntryIds).toEqual([merged?.resource.entries[0].id]);
  });

  it("marks an earlier point as superseded when a newer source corrects it", async () => {
    const repository = new MemoryLearningItemRepository();
    const first = item("10000000-0000-4000-8000-000000000025", "2026-08-18T10:00:00.000Z", card({
      title: "HSA contribution deadline",
      primaryTopic: "HSA contribution deadline",
      domain: "finance",
      presentationType: "explainer",
      contentType: "factual_information",
      keyTakeaways: ["Deadline — Complete every contribution by December 31."],
    }));
    const second = item("10000000-0000-4000-8000-000000000026", "2026-08-18T11:00:00.000Z", card({
      title: "Updated HSA contribution deadline",
      primaryTopic: "HSA contribution deadline",
      domain: "finance",
      presentationType: "explainer",
      contentType: "factual_information",
      keyTakeaways: ["Deadline — Eligible prior-year contributions may be made through the applicable tax deadline."],
    }));
    await repository.save(first);
    await repository.save(second);
    const created = await upsertKnowledgeResourceForItem(first, repository);
    const existingEntryId = created!.resource.entries[0].id;
    const merger: KnowledgeResourceMerger = {
      async decide({ candidates }) {
        return {
          matchDecision: "merge",
          matchedResourceId: candidates[0].id,
          confidence: 0.99,
          reason: "The newer source corrects the deadline for the same contribution rule.",
          inferredIntent: "understand",
          synthesizedTitle: "HSA contribution deadlines",
          synthesizedSummary: "Current HSA contribution timing, including the rule for eligible prior-year contributions.",
          pointDecisions: [{ incomingIndex: 0, action: "updates", existingEntryId, reason: "This replaces an overbroad December 31 rule." }],
          model: "test-merge-model",
          promptVersion: "test-merge-v1",
        };
      },
    };
    const merged = await upsertKnowledgeResourceForItem(second, repository, { merger });

    expect(merged?.contribution.disposition).toBe("updated");
    expect(merged?.contribution.updatedEntryIds).toHaveLength(1);
    expect(merged?.resource.entries.map((entry) => entry.status)).toEqual(["superseded", "active"]);
    expect(merged?.resource.entries[0].relatedEntryIds).toEqual([merged?.resource.entries[1].id]);
  });

  it("creates a separate resource when matching is uncertain", async () => {
    const repository = new MemoryLearningItemRepository();
    const first = item("10000000-0000-4000-8000-000000000031", "2026-08-18T10:00:00.000Z", card({
      title: "How an HSA works",
      primaryTopic: "HSA",
      domain: "finance",
      presentationType: "explainer",
    }));
    const second = item("10000000-0000-4000-8000-000000000032", "2026-08-18T11:00:00.000Z", card({
      title: "Infinite banking overview",
      primaryTopic: "infinite banking",
      domain: "finance",
      presentationType: "explainer",
    }));
    await repository.save(first);
    await repository.save(second);
    const created = await upsertKnowledgeResourceForItem(first, repository);
    const merger: KnowledgeResourceMerger = {
      async decide() {
        return {
          matchDecision: "uncertain",
          matchedResourceId: null,
          confidence: 0.55,
          reason: "Both concern personal finance, but their mechanisms and decisions differ.",
          inferredIntent: "understand",
          synthesizedTitle: null,
          synthesizedSummary: null,
          pointDecisions: second.card!.keyTakeaways.map((_takeaway, incomingIndex) => ({ incomingIndex, action: "new" as const, existingEntryId: null, reason: "A separate subject." })),
          model: "test-merge-model",
          promptVersion: "test-merge-v1",
        };
      },
    };
    const separate = await upsertKnowledgeResourceForItem(second, repository, { merger });

    expect(separate?.resource.id).not.toBe(created?.resource.id);
    expect(await repository.listResources(profileId)).toHaveLength(2);
    expect(separate?.contribution.decisionMode).toBe("ai");
    expect(separate?.contribution.decisionReason).toContain("mechanisms");
  });

  it("falls back to deterministic matching when the AI decision is unavailable", async () => {
    const repository = new MemoryLearningItemRepository();
    const first = item("10000000-0000-4000-8000-000000000041", "2026-08-18T10:00:00.000Z", card());
    const second = item("10000000-0000-4000-8000-000000000042", "2026-08-18T11:00:00.000Z", card({
      title: "Japan trip tips",
      primaryTopic: "Japan travel preparation",
    }));
    await repository.save(first);
    await repository.save(second);
    const created = await upsertKnowledgeResourceForItem(first, repository);
    const unavailableMerger: KnowledgeResourceMerger = { async decide() { throw new Error("temporarily unavailable"); } };
    const merged = await upsertKnowledgeResourceForItem(second, repository, { merger: unavailableMerger });

    expect(merged?.resource.id).toBe(created?.resource.id);
    expect(merged?.contribution.decisionMode).toBe("deterministic");
  });
});
