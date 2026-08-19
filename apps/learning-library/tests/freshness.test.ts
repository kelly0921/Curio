import { describe, expect, it, vi } from "vitest";
import type { LearningCardResearcher } from "@/lib/ai/services";
import { learningItemSchema, type KnowledgeResource, type LearningCard, type ResearchFinding } from "@/lib/domain";
import { MemoryLearningItemRepository } from "@/lib/data/memory-repository";
import { assessKnowledgeResourceFreshness } from "@/lib/knowledge/freshness";
import { refreshKnowledgeResourceResearch } from "@/lib/knowledge/refresh";
import { upsertKnowledgeResourceForItem } from "@/lib/knowledge/resources";

const profileId = "00000000-0000-4000-8000-000000000031";
const sourceId = "10000000-0000-4000-8000-000000000201";
const createdAt = "2026-01-01T12:00:00.000Z";
const oldResearchDate = "2026-01-02T12:00:00.000Z";

const confirmedFinding: ResearchFinding = {
  topic: "HSA tax treatment",
  verdict: "confirmed",
  explanation: "Qualified HSA treatment is supported under current rules.",
  correction: null,
  sources: [{ title: "Publication 969", publisher: "IRS", url: "https://www.irs.gov/publications/p969" }],
};

function financeCard(finding: ResearchFinding | null = confirmedFinding): LearningCard {
  return {
    title: "How an HSA works",
    primaryTopic: "health savings accounts",
    secondaryTopics: ["tax treatment"],
    domain: "finance",
    presentationType: "explainer",
    contentType: "factual_information",
    summary: "An HSA can combine medical spending with tax advantages.",
    keyTakeaways: ["Tax treatment — Qualified contributions, growth, and withdrawals may receive tax advantages."],
    relevanceReason: "Useful for financial planning.",
    suggestedAction: "Check eligibility before contributing.",
    claimsToVerify: [{
      claim: "HSAs receive multiple tax advantages.",
      category: "high_stakes_factual_claim",
      reasonToVerify: "Tax rules can change.",
    }],
    notes: [],
    researchBrief: finding ? {
      mode: "source_validation",
      overview: "Current IRS guidance supports the core point.",
      findings: [finding],
      researchedAt: oldResearchDate,
      model: "test-researcher",
      promptVersion: "test-research-v1",
    } : null,
    personalization: null,
  };
}

function source(card: LearningCard) {
  return learningItemSchema.parse({
    id: sourceId,
    profileId,
    sourceType: "external_url",
    sourceUrl: "https://example.com/hsa",
    platform: "instagram",
    creator: "@creator",
    sourceCaption: "An HSA can have tax advantages.",
    transcript: null,
    extractedVisualText: null,
    uploadedMediaReference: null,
    sourceFingerprint: "freshness-hsa-source",
    accessLevel: "partial",
    processingStatus: "partial",
    intent: "verify",
    sourceMaterials: [{
      kind: "caption",
      label: "Caption",
      text: "An HSA can have tax advantages.",
      origin: "user_supplied",
      completeness: "partial",
    }],
    card,
    analysisMode: "live_openai",
    analysisModel: "test-analyzer",
    analysisPromptVersion: "test-analysis-v1",
    sourceRetrievalVersion: null,
    transcriptionModel: null,
    issues: [],
    createdAt,
    updatedAt: createdAt,
  });
}

function resourcePatch(patch: Partial<KnowledgeResource>): KnowledgeResource {
  return {
    id: "20000000-0000-4000-8000-000000000201",
    profileId,
    resourceType: "guide",
    domain: "career",
    intent: "understand",
    canonicalTopic: "career reflection",
    title: "Career reflection",
    summary: "Evergreen notes for reflecting on work.",
    entities: ["career reflection"],
    entries: [{
      id: "30000000-0000-4000-8000-000000000201",
      kind: "insight",
      heading: null,
      detail: "Write down useful outcomes.",
      sourceItemIds: [sourceId],
      research: null,
      researchedAt: null,
      status: "active",
      relatedEntryIds: [],
    }],
    sourceItemIds: [sourceId],
    contributions: [{
      sourceItemId: sourceId,
      disposition: "created",
      addedEntryIds: ["30000000-0000-4000-8000-000000000201"],
      supportedEntryIds: [],
      updatedEntryIds: [],
      conflictingEntryIds: [],
      summary: "Created this guide with 1 insight.",
      decisionMode: "deterministic",
      decisionConfidence: 1,
      decisionReason: null,
      mergeModel: null,
      mergePromptVersion: null,
      createdAt,
    }],
    lastResearchedAt: null,
    mergeModel: null,
    mergePromptVersion: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    ...patch,
  };
}

describe("resource research freshness", () => {
  it("uses shorter review windows for watchlists and tracked knowledge", () => {
    const watchlist = resourcePatch({ resourceType: "watchlist", domain: "finance", intent: "track", lastResearchedAt: "2026-08-01T12:00:00.000Z" });

    expect(assessKnowledgeResourceFreshness(watchlist, new Date("2026-08-10T12:00:00.000Z"))).toEqual(expect.objectContaining({
      status: "current",
      intervalDays: 14,
      refreshRecommended: false,
    }));
    expect(assessKnowledgeResourceFreshness(watchlist, new Date("2026-08-16T12:00:00.000Z"))).toEqual(expect.objectContaining({
      status: "due",
      refreshRecommended: true,
    }));
  });

  it("requests initial research only when the resource benefits from it", () => {
    const finance = resourcePatch({ domain: "finance" });
    const evergreenCareer = resourcePatch({ domain: "career" });

    expect(assessKnowledgeResourceFreshness(finance)).toEqual(expect.objectContaining({ status: "unresearched", intervalDays: 30 }));
    expect(assessKnowledgeResourceFreshness(evergreenCareer)).toEqual(expect.objectContaining({ status: "not_required", intervalDays: null }));
  });

  it("refreshes source research, rebuilds the resource, and records material corrections", async () => {
    const repository = new MemoryLearningItemRepository();
    const item = source(financeCard());
    await repository.save(item);
    const created = await upsertKnowledgeResourceForItem(item, repository, { now: () => oldResearchDate });
    const correctedFinding: ResearchFinding = {
      ...confirmedFinding,
      verdict: "corrected",
      explanation: "The broad claim needs an eligibility condition.",
      correction: "HSA contributions require qualifying coverage and no disqualifying coverage.",
    };
    const researcher: LearningCardResearcher = {
      research: vi.fn().mockResolvedValue({
        mode: "source_validation",
        overview: "The tax benefit remains useful, with an eligibility correction.",
        findings: [correctedFinding],
        model: "test-researcher-v2",
        promptVersion: "test-research-v2",
      }),
    };

    const refreshed = await refreshKnowledgeResourceResearch(created!.resource.id, repository, researcher, {
      now: () => "2026-08-18T12:00:00.000Z",
    });

    expect(researcher.research).toHaveBeenCalledOnce();
    expect(refreshed?.resource.entries[0].research?.verdict).toBe("corrected");
    expect(refreshed?.resource.lastResearchedAt).toBe("2026-08-18T12:00:00.000Z");
    expect(refreshed?.freshness.status).toBe("current");
    expect(refreshed?.receipt).toEqual(expect.objectContaining({
      checkedSourceCount: 1,
      materialChangeCount: 1,
      summary: "Research refreshed: 1 correction.",
    }));
    expect(refreshed?.resource.contributions.at(-1)?.summary).toBe("Research refreshed: 1 correction.");
    expect((await repository.findById(sourceId))?.card?.researchBrief?.findings[0].verdict).toBe("corrected");
  });

  it("keeps the receipt quiet when current research does not materially change", async () => {
    const repository = new MemoryLearningItemRepository();
    const item = source(financeCard());
    await repository.save(item);
    const created = await upsertKnowledgeResourceForItem(item, repository, { now: () => oldResearchDate });
    const researcher: LearningCardResearcher = {
      research: vi.fn().mockResolvedValue({
        mode: "source_validation",
        overview: "Current IRS guidance supports the core point.",
        findings: [confirmedFinding],
        model: "test-researcher",
        promptVersion: "test-research-v1",
      }),
    };

    const refreshed = await refreshKnowledgeResourceResearch(created!.resource.id, repository, researcher, {
      now: () => "2026-08-18T12:00:00.000Z",
    });

    expect(refreshed?.receipt.materialChangeCount).toBe(0);
    expect(refreshed?.receipt.summary).toBe("Research is current; no material changes were found.");
  });
});
