import { describe, expect, it } from "vitest";
import type {
  ContextDomain,
  KnowledgeResource,
  KnowledgeResourceEntry,
  LearningItem,
  ResourceContribution,
} from "@/lib/domain";
import { buildCrossSaveSynthesis } from "@/lib/knowledge/synthesis";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const RECENT = "2026-08-18T12:00:00.000Z";
const OLD = "2026-07-01T12:00:00.000Z";

function item(id: string, createdAt = RECENT): LearningItem {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    card: { title: `Save ${id}` },
  } as LearningItem;
}

function entry(
  id: string,
  sourceItemIds: string[],
  patch: Partial<KnowledgeResourceEntry> = {},
): KnowledgeResourceEntry {
  return {
    id,
    kind: "insight",
    heading: `Point ${id}`,
    detail: `A useful, concrete learning from ${sourceItemIds.length} saved source${sourceItemIds.length === 1 ? "" : "s"}.`,
    sourceItemIds,
    research: null,
    researchedAt: null,
    status: "active",
    relatedEntryIds: [],
    ...patch,
  };
}

function contribution(
  sourceItemId: string,
  disposition: ResourceContribution["disposition"] = "created",
  createdAt = RECENT,
): ResourceContribution {
  return {
    sourceItemId,
    disposition,
    addedEntryIds: [],
    supportedEntryIds: [],
    updatedEntryIds: [],
    conflictingEntryIds: [],
    summary: disposition === "conflict" ? "A newer save conflicts with the earlier claim." : "A save added useful detail.",
    decisionMode: "deterministic",
    decisionConfidence: 1,
    decisionReason: null,
    mergeModel: null,
    mergePromptVersion: null,
    createdAt,
  };
}

function resource(
  id: string,
  domain: ContextDomain,
  sourceItemIds: string[],
  patch: Partial<KnowledgeResource> = {},
): KnowledgeResource {
  return {
    id,
    profileId: "00000000-0000-4000-8000-000000000031",
    resourceType: "guide",
    domain,
    intent: "understand",
    canonicalTopic: `Topic ${id}`,
    title: `Resource ${id}`,
    summary: `A reusable guide for ${id}.`,
    entities: [],
    entries: [entry(`entry-${id}`, sourceItemIds)],
    sourceItemIds,
    contributions: sourceItemIds.map((sourceId) => contribution(sourceId)),
    lastResearchedAt: null,
    mergeModel: null,
    mergePromptVersion: null,
    version: 1,
    createdAt: RECENT,
    updatedAt: RECENT,
    ...patch,
    coverSourceItemId: patch.coverSourceItemId ?? null,
    coverCapturedAt: patch.coverCapturedAt ?? null,
  };
}

describe("cross-save synthesis", () => {
  it("forms only evidence-backed themes and accurately counts weekly activity", () => {
    const items = [item("save-1"), item("save-2"), item("save-3"), item("save-4")];
    const resources = [
      resource("hsa", "finance", ["save-1"], {
        createdAt: OLD,
        contributions: [contribution("old-hsa", "created", OLD), contribution("save-1", "updated")],
      }),
      resource("investing", "finance", ["save-2"]),
      resource("interviews", "career", ["save-3", "save-4"]),
      resource("single-trip", "travel", ["old-save"], { createdAt: OLD, updatedAt: OLD, contributions: [contribution("old-save", "created", OLD)] }),
    ];

    const result = buildCrossSaveSynthesis({ items, resources, now: NOW });

    expect(result.period.mode).toBe("this_week");
    expect(result.overview.savedSourceCount).toBe(4);
    expect(result.overview.newResourceCount).toBe(2);
    expect(result.overview.changedResourceCount).toBe(1);
    expect(result.themes.map((theme) => theme.domain)).toEqual(["career"]);
    expect(result.themes.find((theme) => theme.domain === "career")?.sourceCount).toBe(2);
    expect(result.interests.map((interest) => interest.domain)).toEqual(["finance"]);
    expect(result.themes.some((theme) => theme.domain === "travel")).toBe(false);
  });

  it("clusters genuine concept overlap while keeping unrelated resources as separate interests", () => {
    const hsaBasics = resource("hsa-basics", "finance", ["save-1"], {
      canonicalTopic: "Health Savings Accounts",
      title: "How an HSA works",
      entities: ["Health Savings Accounts", "qualified medical withdrawals"],
    });
    const hsaInvesting = resource("hsa-investing", "finance", ["save-2"], {
      canonicalTopic: "Investing an HSA",
      title: "Using an HSA for long-term investing",
      entities: ["HSA", "tax-free growth"],
    });
    const infiniteBanking = resource("infinite-banking", "finance", ["save-3"], {
      canonicalTopic: "Infinite banking",
      entities: ["whole life insurance", "policy loans"],
    });
    const opticalStocks = resource("optical-stocks", "finance", ["save-4"], {
      canonicalTopic: "optical transceiver stocks",
      entities: ["data center networking", "fiber optic validation"],
    });

    const result = buildCrossSaveSynthesis({
      items: [item("save-1"), item("save-2"), item("save-3"), item("save-4")],
      resources: [hsaBasics, hsaInvesting, infiniteBanking, opticalStocks],
      now: NOW,
    });

    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].title).toBe("Health savings accounts");
    expect(result.themes[0].resourceIds).toEqual(["hsa-basics", "hsa-investing"]);
    expect(result.interests).toHaveLength(1);
    expect(result.interests[0].resourceIds).toEqual(["infinite-banking", "optical-stocks"]);
    expect(result.interests[0].description).toBe("2 separate recent subjects in the same broad area.");
  });

  it("shows a repeated point only when multiple saved sources support the same entry", () => {
    const oneSource = resource("one", "travel", ["save-1"]);
    const repeated = resource("repeat", "career", ["save-2", "save-3"], {
      entries: [entry("repeated-point", ["save-2", "save-3"], {
        research: {
          topic: "Interview preparation",
          verdict: "confirmed",
          explanation: "The tactic is supported.",
          correction: null,
          sources: [],
        },
        researchedAt: RECENT,
      })],
    });

    const result = buildCrossSaveSynthesis({
      items: [item("save-1"), item("save-2"), item("save-3")],
      resources: [oneSource, repeated],
      now: NOW,
    });

    expect(result.repeated?.resourceId).toBe("repeat");
    expect(result.repeated?.supportCount).toBe(2);
    expect(buildCrossSaveSynthesis({ items: [item("save-1")], resources: [oneSource], now: NOW }).repeated).toBeNull();
  });

  it("resurfaces one intent-specific point without turning it into a generic next step", () => {
    const practical = resource("content-audit", "ai_work", ["save-1"], {
      resourceType: "playbook",
      intent: "try",
      title: "Use actors for content audits",
      entries: [entry("audit-step", ["save-1"], {
        heading: "Map the audit",
        detail: "List the pages and checks before assigning each repeatable task to an actor.",
      })],
    });
    const explainer = resource("career-terms", "career", ["save-2"], {
      resourceType: "glossary",
      intent: "understand",
      title: "Career terms in plain English",
      entries: [entry("career-term", ["save-2"], {
        heading: "Scope of impact",
        detail: "The breadth and importance of the outcomes someone influences at work.",
      })],
    });

    const result = buildCrossSaveSynthesis({
      items: [item("save-1"), item("save-2")],
      resources: [practical, explainer],
      now: NOW,
    });

    expect(result.nextUse).toEqual(expect.objectContaining({
      resourceId: "content-audit",
      intent: "try",
      label: "Ready to try",
      heading: "Map the audit",
    }));
    expect(result.nextUse?.point).toContain("assigning each repeatable task");
    expect(result.remember?.resourceId).toBe("career-terms");
  });

  it("prioritizes source conflicts and unverified claims without treating corrections as unresolved", () => {
    const corrected = resource("corrected", "finance", ["save-1"], {
      entries: [entry("corrected-point", ["save-1"], {
        research: {
          topic: "Tax rule",
          verdict: "corrected",
          explanation: "The original source was incomplete.",
          correction: "Use the applicable tax deadline.",
          sources: [],
        },
        researchedAt: RECENT,
      })],
    });
    const unverified = resource("unverified", "finance", ["save-2"], {
      entries: [entry("unverified-point", ["save-2"], {
        research: {
          topic: "Investment outcome",
          verdict: "not_verified",
          explanation: "No reliable evidence confirms the projected return.",
          correction: null,
          sources: [],
        },
        researchedAt: RECENT,
      })],
    });
    const contested = resource("contested", "finance", ["save-3", "save-4"], {
      entries: [entry("contested-point", ["save-3"], { status: "contested" })],
      contributions: [contribution("save-3"), contribution("save-4", "conflict")],
    });

    const result = buildCrossSaveSynthesis({
      items: [item("save-1"), item("save-2"), item("save-3"), item("save-4")],
      resources: [corrected, unverified, contested],
      now: NOW,
    });

    expect(result.unresolved?.resourceId).toBe("contested");
    expect(result.unresolved?.kind).toBe("contested");
    expect(result.unresolved?.reason).toContain("disagree");
  });

  it("falls back to library-wide patterns when there are no recent saves and never fabricates empty modules", () => {
    const resources = [
      resource("old-one", "ai_work", ["old-1"], { createdAt: OLD, updatedAt: OLD, contributions: [contribution("old-1", "created", OLD)] }),
      resource("old-two", "ai_work", ["old-2"], { createdAt: OLD, updatedAt: OLD, contributions: [contribution("old-2", "created", OLD)] }),
    ];

    const result = buildCrossSaveSynthesis({ items: [item("old-1", OLD), item("old-2", OLD)], resources, now: NOW });

    expect(result.period.mode).toBe("library");
    expect(result.period.label).toBe("Across your library");
    expect(result.themes).toHaveLength(0);
    expect(result.interests).toHaveLength(1);
    expect(result.repeated).toBeNull();
    expect(result.changed).toBeNull();
    expect(result.fallbackResourceIds).toEqual(["old-one", "old-two"]);
  });

  it("prefers durable knowledge that matches personal context over a watchlist fact", () => {
    const confirmedResearch = {
      topic: "Current evidence",
      verdict: "confirmed" as const,
      explanation: "Independent evidence supports this point.",
      correction: null,
      sources: [],
    };
    const hsa = resource("hsa-guide", "finance", ["save-1"], {
      title: "How an HSA works",
      lastResearchedAt: RECENT,
      entries: [entry("hsa-tax", ["save-1"], { detail: "Eligible HSA contributions, growth, and qualified withdrawals can receive tax advantages.", research: confirmedResearch, researchedAt: RECENT })],
    });
    const funding = resource("funding-watchlist", "career", ["save-2"], {
      resourceType: "watchlist",
      lastResearchedAt: RECENT,
      entries: [entry("funding-round", ["save-2"], { detail: "A startup announced a large funding round.", research: confirmedResearch, researchedAt: RECENT })],
    });

    const result = buildCrossSaveSynthesis({
      items: [item("save-1"), item("save-2")],
      resources: [funding, hsa],
      context: {
        profileId: "profile",
        syncedAt: RECENT,
        connections: [{ id: "demo", isDemo: true }],
        records: [{ connectionId: "demo", domain: "finance", keywords: ["hsa", "tax", "account"] }],
      } as never,
      now: NOW,
    });

    expect(result.remember?.resourceId).toBe("hsa-guide");
  });
});
